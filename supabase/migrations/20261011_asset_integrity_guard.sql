-- Enforce asset and maintenance referential integrity in signed-in Cloud Workspace JSON.
-- Existing user records are not deleted or changed.
CREATE OR REPLACE FUNCTION public.opsfusion_guard_asset_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $guard$
DECLARE
  obj jsonb;
  asset_id text;
  tag text;
  linked_endpoint text;
  assigned_id text;
  linked_asset text;
  due text;
  asset_count integer;
  seen_tags jsonb := '{}'::jsonb;
  seen_ids jsonb := '{}'::jsonb;
  seen_maintenance jsonb := '{}'::jsonb;
  available_asset_ids text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(NEW.state->'assets') NOT IN ('array') THEN
    RAISE EXCEPTION 'Workspace assets must be an array' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(NEW.state->'maintenance') NOT IN ('array') THEN
    RAISE EXCEPTION 'Workspace maintenance must be an array' USING ERRCODE='23514';
  END IF;
  FOR obj IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.state->'assets','[]'::jsonb))
  LOOP
    asset_id := btrim(coalesce(obj->>'id',''));
    tag := btrim(coalesce(obj->>'tag',''));
    IF asset_id = '' OR tag = '' OR length(tag) > 128 THEN
      RAISE EXCEPTION 'Asset ID and tag are required and tags must be <=128 characters' USING ERRCODE='23514';
    END IF;
    IF seen_ids ? asset_id OR seen_tags ? lower(tag) THEN
      RAISE EXCEPTION 'Duplicate asset ID or asset tag: %',tag USING ERRCODE='23505';
    END IF;
    seen_ids := seen_ids || jsonb_build_object(asset_id,true);
    seen_tags := seen_tags || jsonb_build_object(lower(tag),true);
    available_asset_ids := array_append(available_asset_ids,asset_id);
    IF coalesce(obj->>'status','') NOT IN ('Assigned','Available','In Repair','Retired','Lost') THEN
      RAISE EXCEPTION 'Invalid lifecycle state for asset %',tag USING ERRCODE='23514';
    END IF;
    linked_endpoint := nullif(obj->>'endpointId','');
    IF linked_endpoint IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.state->'endpoints')='array' THEN NEW.state->'endpoints' ELSE '[]'::jsonb END) ep(value)
      WHERE ep.value->>'id'=linked_endpoint
    ) THEN
      RAISE EXCEPTION 'Asset % links to missing endpoint %',tag,linked_endpoint USING ERRCODE='23514';
    END IF;
    assigned_id := nullif(obj->>'assignedUserId','');
    IF obj->>'status'='Assigned' THEN
      IF assigned_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.state->'identities')='array' THEN NEW.state->'identities' ELSE '[]'::jsonb END) usr(value)
        WHERE usr.value->>'id'=assigned_id AND usr.value->>'status'='Active'
      ) THEN
        RAISE EXCEPTION 'Assigned asset % requires a valid active identity record',tag USING ERRCODE='23514';
      END IF;
    ELSIF assigned_id IS NOT NULL THEN
      RAISE EXCEPTION 'Asset % cannot retain an assignee outside Assigned status',tag USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOR obj IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.state->'maintenance','[]'::jsonb))
  LOOP
    asset_id := btrim(coalesce(obj->>'id',''));
    linked_asset := nullif(obj->>'assetId','');
    due := obj->>'dueDate';
    IF asset_id='' OR seen_maintenance ? asset_id THEN
      RAISE EXCEPTION 'Maintenance IDs must be present and unique' USING ERRCODE='23505';
    END IF;
    seen_maintenance := seen_maintenance || jsonb_build_object(asset_id,true);
    IF linked_asset IS NULL OR NOT (linked_asset = ANY(available_asset_ids)) THEN
      RAISE EXCEPTION 'Maintenance task % links to missing asset',asset_id USING ERRCODE='23514';
    END IF;
    IF due IS NULL OR due !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Maintenance task % requires ISO due date',asset_id USING ERRCODE='23514';
    END IF;
    BEGIN
      PERFORM due::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Maintenance task % has invalid date',asset_id USING ERRCODE='23514';
    END;
  END LOOP;
  RETURN NEW;
END $guard$;

DROP TRIGGER IF EXISTS opsfusion_enforce_asset_integrity ON public.opsfusion_workspaces;
CREATE TRIGGER opsfusion_enforce_asset_integrity
BEFORE INSERT OR UPDATE OF state ON public.opsfusion_workspaces
FOR EACH ROW EXECUTE FUNCTION public.opsfusion_guard_asset_integrity();
