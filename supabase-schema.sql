-- OpsFusion Phase 3 Supabase schema
-- Public frontend uses only the publishable key. Service-role/secret keys must never be exposed.
-- All OpsFusion tables are protected by RLS and are inaccessible to anon.

create table if not exists public.opsfusion_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'OpsFusion User',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opsfusion_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'OpsFusion Unified',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opsfusion_memberships (
  workspace_id uuid not null references public.opsfusion_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','technician','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.opsfusion_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.opsfusion_workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  action text not null,
  target text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists opsfusion_workspaces_owner_idx on public.opsfusion_workspaces(owner_id);
create index if not exists opsfusion_memberships_user_idx on public.opsfusion_memberships(user_id);
create index if not exists opsfusion_audit_workspace_created_idx on public.opsfusion_audit_events(workspace_id,created_at desc);
create index if not exists opsfusion_audit_actor_idx on public.opsfusion_audit_events(actor_id);

alter table public.opsfusion_profiles enable row level security;
alter table public.opsfusion_workspaces enable row level security;
alter table public.opsfusion_memberships enable row level security;
alter table public.opsfusion_audit_events enable row level security;

revoke all on public.opsfusion_profiles from anon;
revoke all on public.opsfusion_workspaces from anon;
revoke all on public.opsfusion_memberships from anon;
revoke all on public.opsfusion_audit_events from anon;

grant select,insert,update on public.opsfusion_profiles to authenticated;
grant select,insert,update,delete on public.opsfusion_workspaces to authenticated;
grant select,insert on public.opsfusion_memberships to authenticated;
grant select,insert on public.opsfusion_audit_events to authenticated;

-- Policies are intentionally scoped to the signed-in user/workspace membership.
-- See the active Supabase project for the installed policy definitions.
