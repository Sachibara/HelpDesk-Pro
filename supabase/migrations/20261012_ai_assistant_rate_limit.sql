-- OpsFusion AI request quota: private per-user buckets, no API-accessible ticket content.
CREATE TABLE IF NOT EXISTS opsfusion_private.ai_request_quotas (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 15),
  PRIMARY KEY (user_id, bucket_start)
);
REVOKE ALL ON opsfusion_private.ai_request_quotas FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.opsfusion_ai_consume_quota(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  accepted boolean := false;
BEGIN
  -- Only the Edge Function's service-role client may consume quota.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN RETURN false; END IF;
  INSERT INTO opsfusion_private.ai_request_quotas(user_id,bucket_start,used)
  VALUES (p_user_id,pg_catalog.date_trunc('hour',pg_catalog.now()),1)
  ON CONFLICT (user_id,bucket_start)
  DO UPDATE SET used = opsfusion_private.ai_request_quotas.used + 1
  WHERE opsfusion_private.ai_request_quotas.used < 15
  RETURNING true INTO accepted;
  RETURN coalesce(accepted,false);
END;
$function$;
REVOKE ALL ON FUNCTION public.opsfusion_ai_consume_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opsfusion_ai_consume_quota(uuid) TO service_role;