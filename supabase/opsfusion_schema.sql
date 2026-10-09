-- OpsFusion dedicated Supabase project initial setup.
-- Run once on the OpsFusion project only (NOT OmniShare/NetOps).
-- Uses Supabase auth.users for credentials and authenticated RLS for each workspace.

CREATE TABLE public.opsfusion_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'OpsFusion User',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.opsfusion_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'OpsFusion Unified',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.opsfusion_memberships (
  workspace_id uuid NOT NULL REFERENCES public.opsfusion_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','technician','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE public.opsfusion_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.opsfusion_workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX opsfusion_workspace_owner_idx ON public.opsfusion_workspaces(owner_id);
CREATE INDEX opsfusion_memberships_user_idx ON public.opsfusion_memberships(user_id);
CREATE INDEX opsfusion_audit_workspace_time_idx ON public.opsfusion_audit_events(workspace_id,created_at DESC);

ALTER TABLE public.opsfusion_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opsfusion_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opsfusion_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opsfusion_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY opsfusion_profiles_select_self ON public.opsfusion_profiles
 FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY opsfusion_profiles_insert_self ON public.opsfusion_profiles
 FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY opsfusion_profiles_update_self ON public.opsfusion_profiles
 FOR UPDATE TO authenticated USING (user_id = (select auth.uid()))
 WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY opsfusion_memberships_select_self ON public.opsfusion_memberships
 FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY opsfusion_memberships_insert_owner_admin ON public.opsfusion_memberships
 FOR INSERT TO authenticated WITH CHECK (
  user_id = (select auth.uid()) AND role='admin'
  AND EXISTS (
    SELECT 1 FROM public.opsfusion_workspaces w
    WHERE w.id=workspace_id AND w.owner_id=(select auth.uid())
  )
 );

CREATE POLICY opsfusion_workspaces_select_member ON public.opsfusion_workspaces
 FOR SELECT TO authenticated USING (
  owner_id=(select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.opsfusion_memberships m
    WHERE m.workspace_id=id AND m.user_id=(select auth.uid())
  )
 );
CREATE POLICY opsfusion_workspaces_insert_owner ON public.opsfusion_workspaces
 FOR INSERT TO authenticated WITH CHECK (owner_id=(select auth.uid()));
CREATE POLICY opsfusion_workspaces_update_operator ON public.opsfusion_workspaces
 FOR UPDATE TO authenticated
 USING (
  owner_id=(select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.opsfusion_memberships m
    WHERE m.workspace_id=id AND m.user_id=(select auth.uid())
      AND m.role IN ('admin','technician')
  )
 )
 WITH CHECK (
  owner_id=(select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.opsfusion_memberships m
    WHERE m.workspace_id=id AND m.user_id=(select auth.uid())
      AND m.role IN ('admin','technician')
  )
 );
CREATE POLICY opsfusion_workspaces_delete_owner ON public.opsfusion_workspaces
 FOR DELETE TO authenticated USING (owner_id=(select auth.uid()));

CREATE POLICY opsfusion_audit_select_member ON public.opsfusion_audit_events
 FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.opsfusion_workspaces w
    WHERE w.id=workspace_id AND (
      w.owner_id=(select auth.uid()) OR EXISTS (
        SELECT 1 FROM public.opsfusion_memberships m
        WHERE m.workspace_id=w.id AND m.user_id=(select auth.uid())
      )
    )
  )
 );
CREATE POLICY opsfusion_audit_insert_operator ON public.opsfusion_audit_events
 FOR INSERT TO authenticated WITH CHECK (
  actor_id=(select auth.uid()) AND EXISTS (
    SELECT 1 FROM public.opsfusion_workspaces w
    WHERE w.id=workspace_id AND (
      w.owner_id=(select auth.uid()) OR EXISTS (
        SELECT 1 FROM public.opsfusion_memberships m
        WHERE m.workspace_id=w.id AND m.user_id=(select auth.uid())
          AND m.role IN ('admin','technician')
      )
    )
  )
 );

REVOKE ALL ON public.opsfusion_profiles,public.opsfusion_workspaces,
 public.opsfusion_memberships,public.opsfusion_audit_events
 FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT ON public.opsfusion_profiles TO authenticated;
GRANT UPDATE(display_name,updated_at) ON public.opsfusion_profiles TO authenticated;
GRANT SELECT,INSERT ON public.opsfusion_memberships TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.opsfusion_workspaces TO authenticated;
GRANT UPDATE(name,state,updated_at) ON public.opsfusion_workspaces TO authenticated;
GRANT SELECT,INSERT ON public.opsfusion_audit_events TO authenticated;

-- Audit records are append-only to authenticated clients (no UPDATE/DELETE grants).
-- Workspace ownership cannot be reassigned through the browser.
