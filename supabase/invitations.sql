-- Invitation IDs are selectors, never bearer credentials. Verified recipient identity is mandatory.
create schema if not exists opsfusion_invite_private;
revoke all on schema opsfusion_invite_private from public,anon;
grant usage on schema opsfusion_invite_private to authenticated,service_role;
create table public.opsfusion_invitations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.opsfusion_workspaces(id) on delete cascade,
 email text not null check(email=lower(btrim(email))),
 kind text not null check(kind in ('staff','employee')),
 identity_id text,
 invited_by uuid not null references auth.users(id),
 recipient_id uuid references auth.users(id),
 status text not null default 'pending' check(status in ('pending','accepted','cancelled')),
 delivery text not null default 'sending' check(delivery in ('sending','sent','failed')),
 created_at timestamptz not null default now(),
 last_sent_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '48 hours',
 accepted_at timestamptz,
 attempts integer not null default 1,
 check ((kind='employee' and identity_id is not null) or (kind='staff' and identity_id is null))
);
alter table public.opsfusion_invitations enable row level security;
revoke all on public.opsfusion_invitations from public,anon,authenticated;
grant select,update on public.opsfusion_invitations to service_role;
create unique index opsfusion_invitation_pending_email on public.opsfusion_invitations(workspace_id,email,kind) where status='pending';
create unique index opsfusion_invitation_pending_identity on public.opsfusion_invitations(workspace_id,identity_id) where status='pending' and kind='employee';
create index opsfusion_invitation_recipient on public.opsfusion_invitations(email);
create index opsfusion_invitation_inviter on public.opsfusion_invitations(invited_by);
create index opsfusion_invitation_recipient_id on public.opsfusion_invitations(recipient_id);

create function opsfusion_invite_private.manage(p_action text,p_workspace uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); mail text; confirmed boolean; has_password boolean; w public.opsfusion_workspaces%rowtype;
 inv public.opsfusion_invitations%rowtype; target uuid; v_kind text; ident text; result jsonb;
begin
 if who is null then raise exception 'Sign in required' using errcode='42501';end if;
 select lower(email),email_confirmed_at is not null,coalesce(encrypted_password,'')<>'' into mail,confirmed,has_password from auth.users where id=who;
 if not coalesce(confirmed,false) then raise exception 'Verify your email first' using errcode='42501';end if;
 if p_action='mine' then
  return jsonb_build_object('needs_password',not has_password,'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'workspace',s.name,'kind',i.kind,'expires_at',i.expires_at)) from public.opsfusion_invitations i join public.opsfusion_workspaces s on s.id=i.workspace_id where i.email=mail and (i.recipient_id is null or i.recipient_id=who) and i.status='pending' and i.delivery='sent' and i.expires_at>clock_timestamp() and i.invited_by=s.owner_id),'[]'));
 end if;
 -- Resolve workspace first; every lifecycle transition locks in this same order.
 if p_action in ('accept','cancel','resend') then
  select workspace_id into p_workspace from public.opsfusion_invitations where id=(p_payload->>'id')::uuid;
 end if;
 select * into w from public.opsfusion_workspaces where id=p_workspace for update;
 if not found then raise exception 'Invitation unavailable' using errcode='42501';end if;
 if p_action='accept' then
  select * into inv from public.opsfusion_invitations where id=(p_payload->>'id')::uuid for update;
  if inv.email<>mail or (inv.recipient_id is not null and inv.recipient_id<>who) or inv.invited_by<>w.owner_id then raise exception 'Invitation unavailable' using errcode='42501';end if;
  -- A replay never restores a membership that was subsequently revoked.
  if inv.status='accepted' then return jsonb_build_object('ok',true,'already_accepted',true,'kind',inv.kind);end if;
  if inv.status<>'pending' or inv.delivery<>'sent' or inv.expires_at<=clock_timestamp() then raise exception 'Invitation expired, cancelled or not delivered';end if;
  if not has_password then raise exception 'Set your own password before accepting';end if;
  if who=w.owner_id then raise exception 'Owner already has access';end if;
  if inv.kind='staff' then
   if (select count(*) from public.opsfusion_memberships where workspace_id=w.id)>=100 then raise exception 'Workspace member limit reached';end if;
   insert into public.opsfusion_memberships(workspace_id,user_id,role) values(w.id,who,'technician') on conflict do nothing;
  else
   if not exists(select 1 from jsonb_array_elements(coalesce(w.state->'identities','[]')) u where u->>'id'=inv.identity_id and u->>'status'='Active') then raise exception 'Employee identity is no longer active';end if;
   if exists(select 1 from public.opsfusion_employee_access where workspace_id=w.id and (user_id=who or identity_id=inv.identity_id)) then raise exception 'Employee account or identity already enrolled';end if;
   insert into public.opsfusion_employee_access(workspace_id,user_id,identity_id) values(w.id,who,inv.identity_id);
  end if;
  update public.opsfusion_invitations set status='accepted',accepted_at=now(),recipient_id=who where id=inv.id;
  insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(w.id,who,'Access','Invitation accepted',inv.id::text,inv.kind||' access accepted');
  return jsonb_build_object('ok',true,'kind',inv.kind);
 end if;
 if w.owner_id<>who then raise exception 'Workspace owner required' using errcode='42501';end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,email,kind,identity_id,case when status='pending' and expires_at<=now() then 'expired' else status end as status,delivery,expires_at,last_sent_at,attempts from public.opsfusion_invitations where workspace_id=w.id order by created_at desc limit 100) x),'[]');
 end if;
 if p_action='cancel' then
  update public.opsfusion_invitations set status='cancelled' where id=(p_payload->>'id')::uuid and status='pending' returning * into inv;
  if not found then raise exception 'Only pending invitations can be cancelled';end if;
 elsif p_action in ('create','resend') then
  if (select coalesce(sum(attempts),0) from public.opsfusion_invitations where workspace_id=w.id and last_sent_at>now()-interval '1 day')>=100 then raise exception 'Daily workspace invitation limit reached';end if;
  if p_action='resend' then
   select * into inv from public.opsfusion_invitations where id=(p_payload->>'id')::uuid for update;
   if inv.status<>'pending' then raise exception 'Only pending or expired invitations can be resent';end if;
   if inv.last_sent_at>now()-interval '60 seconds' then raise exception 'Wait at least 60 seconds before resending';end if;
   update public.opsfusion_invitations set delivery='sending',last_sent_at=clock_timestamp(),expires_at=now()+interval '48 hours',attempts=attempts+1 where id=inv.id returning * into inv;
  else
   mail:=lower(btrim(p_payload->>'email'));v_kind:=p_payload->>'kind';ident:=nullif(p_payload->>'identity_id','');
   if mail is null or length(mail)>254 or mail!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_kind is null or v_kind not in ('staff','employee') then raise exception 'Enter a valid email and access type';end if;
   select id into target from auth.users where lower(email)=mail;
   if target=w.owner_id then raise exception 'Owner already has access';end if;
   if v_kind='staff' then
    ident:=null;
    if exists(select 1 from public.opsfusion_memberships where workspace_id=w.id and user_id=target) then raise exception 'This account already has staff access';end if;
   else
    if ident is null or not exists(select 1 from jsonb_array_elements(coalesce(w.state->'identities','[]')) u where u->>'id'=ident and u->>'status'='Active') then raise exception 'Choose an active employee identity';end if;
    if exists(select 1 from public.opsfusion_employee_access where workspace_id=w.id and (user_id=target or identity_id=ident)) then raise exception 'Employee account or identity already enrolled';end if;
   end if;
   if exists(select 1 from public.opsfusion_invitations where workspace_id=w.id and status='pending' and ((email=mail and kind=v_kind) or (v_kind='employee' and identity_id=ident))) then raise exception 'A pending invitation exists. Resend or cancel it first.';end if;
   insert into public.opsfusion_invitations(workspace_id,email,kind,identity_id,invited_by,recipient_id) values(w.id,mail,v_kind,ident,who,target) returning * into inv;
  end if;
 else raise exception 'Unknown invitation action';end if;
 insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(w.id,who,'Access','Invitation '||p_action,inv.id::text,inv.kind||' · '||inv.email);
 return jsonb_build_object('id',inv.id,'email',inv.email,'attempt',inv.attempts,'ok',true);
end $$;
revoke all on function opsfusion_invite_private.manage(text,uuid,jsonb) from public,anon;
grant execute on function opsfusion_invite_private.manage(text,uuid,jsonb) to authenticated;
create function public.opsfusion_invitations_manage(p_action text,p_workspace uuid default null,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select opsfusion_invite_private.manage(p_action,p_workspace,p_payload)$$;
revoke all on function public.opsfusion_invitations_manage(text,uuid,jsonb) from public,anon;
grant execute on function public.opsfusion_invitations_manage(text,uuid,jsonb) to authenticated;
