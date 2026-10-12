-- Non-destructive performance hardening for audit record actor lookups.
-- Existing PK and workspace/created_at indexes remain intact.
-- Adds a covering index for opsfusion_audit_events.actor_id FK.
CREATE INDEX IF NOT EXISTS opsfusion_audit_actor_id_idx
  ON public.opsfusion_audit_events (actor_id);
