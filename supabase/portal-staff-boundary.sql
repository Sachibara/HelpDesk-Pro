-- Capture the signup flow once, in server-controlled app metadata.
-- Later edits to user_metadata must never upgrade a portal account.
create or replace function opsfusion_staff_private.capture_signup_kind() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('opsfusion_owner_signup',coalesce(new.raw_user_meta_data->>'create_workspace','false')='true');
 return new;
end $$;
revoke all on function opsfusion_staff_private.capture_signup_kind() from public,anon,authenticated;
drop trigger if exists opsfusion_capture_signup_kind on auth.users;
create trigger opsfusion_capture_signup_kind before insert on auth.users for each row execute function opsfusion_staff_private.capture_signup_kind();
-- Preserve existing owners. Unconfirmed registrations from the owner signup flow may finish onboarding.
update auth.users u set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('opsfusion_owner_signup',exists(select 1 from public.opsfusion_workspaces w where w.owner_id=u.id) or (u.email_confirmed_at is null and u.raw_user_meta_data->>'create_workspace'='true'));

create or replace function opsfusion_staff_private.create_workspace(p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); w public.opsfusion_workspaces%rowtype;
begin
 if who is null or not exists(select 1 from auth.users where id=who and email_confirmed_at is not null) then raise exception 'Confirmed sign-in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into w from public.opsfusion_workspaces where owner_id=who order by created_at limit 1;
 if not found then
  if not exists(select 1 from auth.users where id=who and raw_app_meta_data->>'opsfusion_owner_signup'='true') then
   raise exception 'Portal accounts require an explicit workspace membership to access IT operations' using errcode='42501';
  end if;
  insert into public.opsfusion_workspaces(owner_id,name,state) values(who,left(coalesce(nullif(trim(p_name),''),'My workspace'),100),'{}') returning * into w;
  insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(w.id,who,'Access','Workspace created',w.name,'Independent workspace');
 end if;
 return to_jsonb(w);
end $$;
