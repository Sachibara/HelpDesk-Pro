create schema if not exists opsfusion_staff_private;
revoke all on schema opsfusion_staff_private from public,anon;
grant usage on schema opsfusion_staff_private to authenticated;
-- Owner-managed staff membership. Browser accounts cannot create workspaces.
revoke insert on public.opsfusion_workspaces from authenticated;
revoke insert,update,delete on public.opsfusion_memberships from authenticated;
drop policy if exists opsfusion_workspaces_insert_owner on public.opsfusion_workspaces;
drop policy if exists opsfusion_memberships_insert_owner_admin on public.opsfusion_memberships;
create or replace function opsfusion_staff_private.staff_access(p_action text,p_workspace uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); owner uuid; target uuid; chosen_role text;
begin
 if who is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select owner_id into owner from public.opsfusion_workspaces where id=p_workspace for update;
 if owner is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
 if p_action='list' then
  if who<>owner and not exists(select 1 from public.opsfusion_memberships where workspace_id=p_workspace and user_id=who) then raise exception 'Staff access required' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,'name',coalesce(p.display_name,u.email),'role',case when u.id=owner then 'owner' else m.role end)) from auth.users u left join public.opsfusion_profiles p on p.user_id=u.id left join public.opsfusion_memberships m on m.user_id=u.id and m.workspace_id=p_workspace where u.id=owner or m.user_id is not null),'[]');
 end if;
 if who<>owner then raise exception 'Workspace owner required' using errcode='42501'; end if;
 if p_action='grant' then
  chosen_role:=p_payload->>'role';
  if chosen_role not in ('admin','technician','viewer') or chosen_role is null then raise exception 'Choose admin, technician or viewer';end if;
  select id into target from auth.users where lower(email)=lower(trim(p_payload->>'email')) and email_confirmed_at is not null;
  if target is null then raise exception 'A confirmed account is required. Register through the portal and confirm the email first.';end if;
  if target=owner then raise exception 'Owner access cannot be changed';end if;
  insert into public.opsfusion_memberships(workspace_id,user_id,role) values(p_workspace,target,chosen_role) on conflict(workspace_id,user_id) do update set role=excluded.role;
 elsif p_action='revoke' then
  target:=(p_payload->>'user_id')::uuid;
  if target is null or target=owner then raise exception 'Owner access cannot be revoked';end if;
  delete from public.opsfusion_memberships where workspace_id=p_workspace and user_id=target;
 else raise exception 'Unknown staff action';end if;
 insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(p_workspace,who,'Access','Staff access '||p_action,target::text,coalesce(chosen_role,'Revoked'));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function opsfusion_staff_private.staff_access(text,uuid,jsonb) from public,anon;
grant execute on function opsfusion_staff_private.staff_access(text,uuid,jsonb) to authenticated;
create or replace function public.opsfusion_staff_access(p_action text,p_workspace uuid,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select opsfusion_staff_private.staff_access(p_action,p_workspace,p_payload)$$;
revoke all on function public.opsfusion_staff_access(text,uuid,jsonb) from public,anon;
grant execute on function public.opsfusion_staff_access(text,uuid,jsonb) to authenticated;
