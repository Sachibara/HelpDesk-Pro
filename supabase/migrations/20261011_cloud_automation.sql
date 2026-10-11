-- OpsFusion cloud automation; no existing workspace records or auth accounts are removed.
CREATE SCHEMA IF NOT EXISTS opsfusion_private;
REVOKE ALL ON SCHEMA opsfusion_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.opsfusion_automation_settings (
 workspace_id uuid PRIMARY KEY REFERENCES public.opsfusion_workspaces(id) ON DELETE CASCADE,
 ticket_sla_enabled boolean NOT NULL DEFAULT true,
 warranty_enabled boolean NOT NULL DEFAULT true,
 maintenance_enabled boolean NOT NULL DEFAULT true,
 warranty_days integer NOT NULL DEFAULT 45 CHECK (warranty_days BETWEEN 1 AND 365),
 maintenance_days integer NOT NULL DEFAULT 7 CHECK (maintenance_days BETWEEN 0 AND 90),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.opsfusion_automation_alerts (
 workspace_id uuid NOT NULL REFERENCES public.opsfusion_workspaces(id) ON DELETE CASCADE,
 event_key text NOT NULL,
 category text NOT NULL CHECK (category IN ('ticket_sla','warranty','maintenance')),
 severity text NOT NULL CHECK (severity IN ('medium','high','critical')),
 title text NOT NULL,
 detail text NOT NULL,
 target_id text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','cleared')),
 first_detected timestamptz NOT NULL DEFAULT now(),
 last_detected timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,event_key)
);
CREATE TABLE IF NOT EXISTS public.opsfusion_automation_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.opsfusion_workspaces(id) ON DELETE CASCADE,
 source text NOT NULL CHECK (source IN ('manual','scheduled')),
 executed_at timestamptz NOT NULL DEFAULT now(),
 checked integer NOT NULL DEFAULT 0,
 created integer NOT NULL DEFAULT 0,
 active integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS opsfusion_automation_alert_status_idx
 ON public.opsfusion_automation_alerts(workspace_id,status,last_detected DESC);
CREATE INDEX IF NOT EXISTS opsfusion_automation_run_date_idx
 ON public.opsfusion_automation_runs(workspace_id,executed_at DESC);

INSERT INTO public.opsfusion_automation_settings(workspace_id)
SELECT id FROM public.opsfusion_workspaces ON CONFLICT DO NOTHING;

CREATE FUNCTION opsfusion_private.create_automation_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.opsfusion_automation_settings(workspace_id)
 VALUES(NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER opsfusion_automation_new_workspace
AFTER INSERT ON public.opsfusion_workspaces
FOR EACH ROW EXECUTE FUNCTION opsfusion_private.create_automation_defaults();

ALTER TABLE public.opsfusion_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opsfusion_automation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opsfusion_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY opsfusion_automation_settings_read ON public.opsfusion_automation_settings
FOR SELECT TO authenticated USING (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w
 WHERE w.id=workspace_id AND (w.owner_id=(SELECT auth.uid()) OR EXISTS(
 SELECT 1 FROM public.opsfusion_memberships m WHERE m.workspace_id=w.id AND m.user_id=(SELECT auth.uid())
 ))));
CREATE POLICY opsfusion_automation_settings_edit ON public.opsfusion_automation_settings
FOR UPDATE TO authenticated USING (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w WHERE w.id=workspace_id AND w.owner_id=(SELECT auth.uid())
)) WITH CHECK (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w WHERE w.id=workspace_id AND w.owner_id=(SELECT auth.uid())
));
CREATE POLICY opsfusion_automation_alert_read ON public.opsfusion_automation_alerts
FOR SELECT TO authenticated USING (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w
 WHERE w.id=workspace_id AND (w.owner_id=(SELECT auth.uid()) OR EXISTS(
 SELECT 1 FROM public.opsfusion_memberships m WHERE m.workspace_id=w.id AND m.user_id=(SELECT auth.uid())
 ))));
CREATE POLICY opsfusion_automation_alert_ack ON public.opsfusion_automation_alerts
FOR UPDATE TO authenticated USING (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w WHERE w.id=workspace_id AND w.owner_id=(SELECT auth.uid())
)) WITH CHECK (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w WHERE w.id=workspace_id AND w.owner_id=(SELECT auth.uid())
));
CREATE POLICY opsfusion_automation_runs_read ON public.opsfusion_automation_runs
FOR SELECT TO authenticated USING (EXISTS(
 SELECT 1 FROM public.opsfusion_workspaces w
 WHERE w.id=workspace_id AND (w.owner_id=(SELECT auth.uid()) OR EXISTS(
 SELECT 1 FROM public.opsfusion_memberships m WHERE m.workspace_id=w.id AND m.user_id=(SELECT auth.uid())
 ))));

REVOKE ALL ON public.opsfusion_automation_settings,public.opsfusion_automation_alerts,public.opsfusion_automation_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.opsfusion_automation_settings,public.opsfusion_automation_alerts,public.opsfusion_automation_runs TO authenticated;
GRANT UPDATE(ticket_sla_enabled,warranty_enabled,maintenance_enabled,warranty_days,maintenance_days) ON public.opsfusion_automation_settings TO authenticated;
GRANT UPDATE(status) ON public.opsfusion_automation_alerts TO authenticated;

CREATE FUNCTION opsfusion_private.safe_date(p_text text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF p_text IS NULL OR p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN NULL; END IF;
 RETURN p_text::date;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE FUNCTION opsfusion_private.safe_time(p_text text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
 IF p_text IS NULL OR length(p_text)>50 THEN RETURN NULL; END IF;
 RETURN p_text::timestamptz;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE FUNCTION opsfusion_private.scan_workspace(p_workspace uuid,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 w record;
 cfg record;
 a record;
 active_keys text[] := ARRAY[]::text[];
 total int := 0;
 inserted int := 0;
 new_rows int := 0;
 active_count int := 0;
BEGIN
 SELECT id,state INTO w FROM public.opsfusion_workspaces WHERE id=p_workspace;
 IF NOT FOUND THEN RETURN jsonb_build_object('checked',0,'created',0,'active',0); END IF;
 INSERT INTO public.opsfusion_automation_settings(workspace_id) VALUES(p_workspace) ON CONFLICT DO NOTHING;
 SELECT * INTO cfg FROM public.opsfusion_automation_settings WHERE workspace_id=p_workspace;
 FOR a IN
   WITH tickets AS (
     SELECT t.value x FROM pg_catalog.jsonb_array_elements(
       CASE WHEN pg_catalog.jsonb_typeof(w.state->'incidents')='array' THEN w.state->'incidents' ELSE '[]'::jsonb END
     ) t(value) WHERE cfg.ticket_sla_enabled AND coalesce(t.value->>'status','New') NOT IN ('Resolved','Closed')
   ),
   assets AS (
     SELECT t.value x FROM pg_catalog.jsonb_array_elements(
       CASE WHEN pg_catalog.jsonb_typeof(w.state->'assets')='array' THEN w.state->'assets' ELSE '[]'::jsonb END
     ) t(value) WHERE cfg.warranty_enabled AND coalesce(t.value->>'status','Available') NOT IN ('Retired','Lost')
   ),
   jobs AS (
     SELECT t.value x FROM pg_catalog.jsonb_array_elements(
       CASE WHEN pg_catalog.jsonb_typeof(w.state->'maintenance')='array' THEN w.state->'maintenance' ELSE '[]'::jsonb END
     ) t(value) WHERE cfg.maintenance_enabled AND coalesce(t.value->>'status','Open') NOT IN ('Completed','Closed','Cancelled')
   ),
   candidates AS (
     SELECT 'sla-response:'||x->>'id' event_key,'ticket_sla' category,
       'high' severity,'First response overdue: '||coalesce(x->>'id','ticket') title,
       coalesce(x->>'title','Service desk ticket')||' · due '||coalesce(x->>'responseDue','unknown') detail,
       x->>'id' target_id
     FROM tickets WHERE x->>'id' IS NOT NULL AND
       nullif(x->>'firstResponseAt','') IS NULL AND
       opsfusion_private.safe_time(x->>'responseDue') < pg_catalog.now()
     UNION ALL
     SELECT 'sla-resolution:'||x->>'id','ticket_sla','critical',
       'Resolution overdue: '||coalesce(x->>'id','ticket'),
       coalesce(x->>'title','Service desk ticket')||' · due '||coalesce(x->>'resolutionDue','unknown'),
       x->>'id'
     FROM tickets WHERE x->>'id' IS NOT NULL AND
       opsfusion_private.safe_time(x->>'resolutionDue') < pg_catalog.now()
     UNION ALL
     SELECT 'warranty:'||x->>'id','warranty',
       CASE WHEN opsfusion_private.safe_date(x->>'warrantyExpiry') < pg_catalog.current_date THEN 'high' ELSE 'medium' END,
       'Warranty '||CASE WHEN opsfusion_private.safe_date(x->>'warrantyExpiry') < pg_catalog.current_date THEN 'expired' ELSE 'expiring' END||': '||coalesce(x->>'tag','asset'),
       coalesce(x->>'hostname','Asset')||' · expiry '||coalesce(x->>'warrantyExpiry','unknown'),
       x->>'id'
     FROM assets WHERE x->>'id' IS NOT NULL AND
       opsfusion_private.safe_date(x->>'warrantyExpiry')<=pg_catalog.current_date + cfg.warranty_days
     UNION ALL
     SELECT 'maintenance:'||x->>'id','maintenance',
       CASE WHEN opsfusion_private.safe_date(x->>'dueDate') < pg_catalog.current_date THEN 'high' ELSE 'medium' END,
       'Maintenance '||CASE WHEN opsfusion_private.safe_date(x->>'dueDate') < pg_catalog.current_date THEN 'overdue' ELSE 'due soon' END||': '||coalesce(x->>'type','Task'),
       coalesce(x->>'detail','Maintenance task')||' · due '||coalesce(x->>'dueDate','unknown'),
       x->>'id'
     FROM jobs WHERE x->>'id' IS NOT NULL AND
       opsfusion_private.safe_date(x->>'dueDate')<=pg_catalog.current_date + cfg.maintenance_days
   )
   SELECT * FROM candidates ORDER BY event_key
 LOOP
    active_keys := pg_catalog.array_append(active_keys,a.event_key);
    total := total+1;
    INSERT INTO public.opsfusion_automation_alerts(workspace_id,event_key,category,severity,title,detail,target_id)
    VALUES(p_workspace,a.event_key,a.category,a.severity,a.title,a.detail,a.target_id)
    ON CONFLICT (workspace_id,event_key) DO NOTHING;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    new_rows:=new_rows+inserted;
    IF inserted=0 THEN
      UPDATE public.opsfusion_automation_alerts
      SET severity=a.severity,title=a.title,detail=a.detail,last_detected=pg_catalog.now()
      WHERE workspace_id=p_workspace AND event_key=a.event_key;
    END IF;
 END LOOP;
 -- Existing acknowledged alerts stay acknowledged; resolved source conditions clear open alerts.
 UPDATE public.opsfusion_automation_alerts
 SET status='cleared',last_detected=pg_catalog.now()
 WHERE workspace_id=p_workspace AND status='open' AND NOT (event_key=ANY(active_keys));
 SELECT pg_catalog.count(*) INTO active_count
 FROM public.opsfusion_automation_alerts WHERE workspace_id=p_workspace AND status='open';
 INSERT INTO public.opsfusion_automation_runs(workspace_id,source,checked,created,active)
 VALUES(p_workspace,p_source,total,new_rows,active_count);
 RETURN jsonb_build_object('checked',total,'created',new_rows,'active',active_count);
END $$;

CREATE FUNCTION public.opsfusion_run_automations(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.opsfusion_workspaces w WHERE w.id=p_workspace_id AND (
   w.owner_id=(SELECT auth.uid()) OR EXISTS(
    SELECT 1 FROM public.opsfusion_memberships m WHERE m.workspace_id=w.id AND m.user_id=(SELECT auth.uid()) AND m.role IN ('admin','technician')
   )
  )
 ) THEN RAISE EXCEPTION 'Not authorized to run workspace automations' USING ERRCODE='42501'; END IF;
 RETURN opsfusion_private.scan_workspace(p_workspace_id,'manual');
END $$;
REVOKE ALL ON FUNCTION public.opsfusion_run_automations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.opsfusion_run_automations(uuid) TO authenticated;

CREATE FUNCTION opsfusion_private.scan_all()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w record;
BEGIN
 FOR w IN SELECT id FROM public.opsfusion_workspaces LOOP
   BEGIN
     PERFORM opsfusion_private.scan_workspace(w.id,'scheduled');
   EXCEPTION WHEN OTHERS THEN
     RAISE WARNING 'OpsFusion automation scan failed for workspace %: %',w.id,SQLERRM;
   END;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION opsfusion_private.scan_all() FROM PUBLIC,anon,authenticated;
