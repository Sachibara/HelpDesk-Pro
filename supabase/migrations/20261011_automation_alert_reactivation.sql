CREATE OR REPLACE FUNCTION opsfusion_private.scan_workspace(p_workspace uuid,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 w record;
 cfg record;
 a record;
 active_keys text[] := ARRAY[]::text[];
 total int := 0;
 inserted int := 0;
 prior_status text;
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
     SELECT 'sla-response:'||(x->>'id') event_key,'ticket_sla' category,
       'high' severity,'First response overdue: '||coalesce(x->>'id','ticket') title,
       coalesce(x->>'title','Service desk ticket')||' · due '||coalesce(x->>'responseDue','unknown') detail,
       x->>'id' target_id
     FROM tickets WHERE x->>'id' IS NOT NULL AND
       nullif(x->>'firstResponseAt','') IS NULL AND
       opsfusion_private.safe_time(x->>'responseDue') < pg_catalog.now()
     UNION ALL
     SELECT 'sla-resolution:'||(x->>'id'),'ticket_sla','critical',
       'Resolution overdue: '||coalesce(x->>'id','ticket'),
       coalesce(x->>'title','Service desk ticket')||' · due '||coalesce(x->>'resolutionDue','unknown'),
       x->>'id'
     FROM tickets WHERE x->>'id' IS NOT NULL AND
       opsfusion_private.safe_time(x->>'resolutionDue') < pg_catalog.now()
     UNION ALL
     SELECT 'warranty:'||(x->>'id'),'warranty',
       CASE WHEN opsfusion_private.safe_date(x->>'warrantyExpiry') < CURRENT_DATE THEN 'high' ELSE 'medium' END,
       'Warranty '||CASE WHEN opsfusion_private.safe_date(x->>'warrantyExpiry') < CURRENT_DATE THEN 'expired' ELSE 'expiring' END||': '||coalesce(x->>'tag','asset'),
       coalesce(x->>'hostname','Asset')||' · expiry '||coalesce(x->>'warrantyExpiry','unknown'),
       x->>'id'
     FROM assets WHERE x->>'id' IS NOT NULL AND
       opsfusion_private.safe_date(x->>'warrantyExpiry')<=CURRENT_DATE + cfg.warranty_days
     UNION ALL
     SELECT 'maintenance:'||(x->>'id'),'maintenance',
       CASE WHEN opsfusion_private.safe_date(x->>'dueDate') < CURRENT_DATE THEN 'high' ELSE 'medium' END,
       'Maintenance '||CASE WHEN opsfusion_private.safe_date(x->>'dueDate') < CURRENT_DATE THEN 'overdue' ELSE 'due soon' END||': '||coalesce(x->>'type','Task'),
       coalesce(x->>'detail','Maintenance task')||' · due '||coalesce(x->>'dueDate','unknown'),
       x->>'id'
     FROM jobs WHERE x->>'id' IS NOT NULL AND
       opsfusion_private.safe_date(x->>'dueDate')<=CURRENT_DATE + cfg.maintenance_days
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
      SELECT status INTO prior_status
      FROM public.opsfusion_automation_alerts
      WHERE workspace_id=p_workspace AND event_key=a.event_key
      FOR UPDATE;
      UPDATE public.opsfusion_automation_alerts
      SET severity=a.severity,title=a.title,detail=a.detail,last_detected=pg_catalog.now(),
        status=CASE WHEN prior_status='cleared' THEN 'open' ELSE status END,
        first_detected=CASE WHEN prior_status='cleared' THEN pg_catalog.now() ELSE first_detected END
      WHERE workspace_id=p_workspace AND event_key=a.event_key;
      IF prior_status='cleared' THEN new_rows := new_rows + 1; END IF;
    END IF;
 END LOOP;
 -- Acknowledged alerts remain acknowledged while active. Clear alerts whenever their source resolves, even if acknowledged.
 UPDATE public.opsfusion_automation_alerts
 SET status='cleared',last_detected=pg_catalog.now()
 WHERE workspace_id=p_workspace AND status <> 'cleared' AND NOT (event_key=ANY(active_keys));
 SELECT pg_catalog.count(*) INTO active_count
 FROM public.opsfusion_automation_alerts WHERE workspace_id=p_workspace AND status='open';
 INSERT INTO public.opsfusion_automation_runs(workspace_id,source,checked,created,active)
 VALUES(p_workspace,p_source,total,new_rows,active_count);
 RETURN jsonb_build_object('checked',total,'created',new_rows,'active',active_count);
END $$;

COMMENT ON FUNCTION opsfusion_private.scan_workspace(uuid,text) IS 'Per-workspace hourly and manual SLA, warranty, maintenance scan, corrected JSON extraction and reactivation of cleared alerts.';