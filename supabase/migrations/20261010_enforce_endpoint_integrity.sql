-- Non-destructive OpsFusion cloud endpoint guard.
-- Existing immutable test records with legacy invalid IPs are preserved until
-- the owner's explicitly approved reset, but cannot be introduced or changed
-- through any future Cloud Workspace write, even from an outdated browser.
CREATE OR REPLACE FUNCTION public.opsfusion_endpoint_ip_allowed(p_ip text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  octet text;
  address inet;
BEGIN
  IF p_ip IS NULL OR p_ip !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
    RETURN false;
  END IF;
  FOREACH octet IN ARRAY string_to_array(p_ip, '.') LOOP
    IF octet <> (octet::integer)::text OR octet::integer > 255 THEN
      RETURN false;
    END IF;
  END LOOP;
  address := p_ip::inet;
  RETURN NOT (
    address <<= inet '0.0.0.0/8'
    OR address <<= inet '100.64.0.0/10'
    OR address <<= inet '127.0.0.0/8'
    OR address <<= inet '169.254.0.0/16'
    OR address <<= inet '192.0.0.0/24'
    OR address <<= inet '192.0.2.0/24'
    OR address <<= inet '192.88.99.0/24'
    OR address <<= inet '198.18.0.0/15'
    OR address <<= inet '198.51.100.0/24'
    OR address <<= inet '203.0.113.0/24'
    OR address <<= inet '224.0.0.0/4'
    OR address <<= inet '240.0.0.0/4'
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION public.opsfusion_guard_workspace_endpoints()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  endpoint jsonb;
  old_endpoint jsonb;
  ip text;
  hostname text;
  normalized_hostname text;
  endpoint_id text;
  seen_hostnames jsonb := '{}'::jsonb;
  seen_ips jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Workspace state must be a JSON object' USING ERRCODE = '23514';
  END IF;
  IF NEW.state ? 'endpoints' AND jsonb_typeof(NEW.state->'endpoints') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Workspace endpoints must be an array' USING ERRCODE = '23514';
  END IF;
  FOR endpoint IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.state->'endpoints','[]'::jsonb))
  LOOP
    endpoint_id := endpoint->>'id';
    hostname := btrim(COALESCE(endpoint->>'hostname',''));
    normalized_hostname := lower(hostname);
    ip := endpoint->>'ip';
    IF hostname = '' OR endpoint_id IS NULL OR endpoint_id = '' THEN
      RAISE EXCEPTION 'Endpoint requires a hostname and identifier' USING ERRCODE = '23514';
    END IF;
    IF seen_hostnames ? normalized_hostname OR seen_ips ? COALESCE(ip,'') THEN
      RAISE EXCEPTION 'Duplicate endpoint hostname or IPv4 address' USING ERRCODE = '23505';
    END IF;
    seen_hostnames := seen_hostnames || jsonb_build_object(normalized_hostname, true);
    seen_ips := seen_ips || jsonb_build_object(COALESCE(ip,''), true);
    IF NOT public.opsfusion_endpoint_ip_allowed(ip) THEN
      old_endpoint := NULL;
      IF TG_OP = 'UPDATE' THEN
        SELECT value INTO old_endpoint
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.state->'endpoints')='array' THEN OLD.state->'endpoints' ELSE '[]'::jsonb END)
        WHERE value->>'id' = endpoint_id
        LIMIT 1;
      END IF;
      -- Historical invalid record may remain unchanged pending planned reset,
      -- but cannot be added again or modified to another invalid address.
      IF old_endpoint IS NULL
        OR old_endpoint->>'ip' IS DISTINCT FROM ip
        OR old_endpoint->>'hostname' IS DISTINCT FROM endpoint->>'hostname'
      THEN
        RAISE EXCEPTION 'Rejected invalid or non-assignable endpoint IPv4 address: %', COALESCE(ip, '<missing>')
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS opsfusion_enforce_endpoint_integrity ON public.opsfusion_workspaces;
CREATE TRIGGER opsfusion_enforce_endpoint_integrity
BEFORE INSERT OR UPDATE OF state ON public.opsfusion_workspaces
FOR EACH ROW EXECUTE FUNCTION public.opsfusion_guard_workspace_endpoints();
