-- Independent owner signup, shared operational permissions and durable audit attribution.
create or replace function opsfusion_staff_private.create_workspace(p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); w public.opsfusion_workspaces%rowtype;
begin
 if who is null or not exists(select 1 from auth.users where id=who and email_confirmed_at is not null) then raise exception 'Confirmed sign-in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(who::text,0));
 select * into w from public.opsfusion_workspaces where owner_id=who order by created_at limit 1;
 if not found then
  insert into public.opsfusion_workspaces(owner_id,name,state) values(who,left(coalesce(nullif(trim(p_name),''),'My workspace'),100),'{}') returning * into w;
  insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(w.id,who,'Access','Workspace created',w.name,'Independent workspace');
 end if;
 return to_jsonb(w);
end $$;
revoke all on function opsfusion_staff_private.create_workspace(text) from public,anon;
grant execute on function opsfusion_staff_private.create_workspace(text) to authenticated;
create or replace function public.opsfusion_create_workspace(p_name text) returns jsonb language sql security invoker set search_path='' as $$select opsfusion_staff_private.create_workspace(p_name)$$;
revoke all on function public.opsfusion_create_workspace(text) from public,anon;
grant execute on function public.opsfusion_create_workspace(text) to authenticated;

-- Store a server-derived snapshot so removing a member does not erase attribution.
alter table public.opsfusion_audit_events add column if not exists actor_name text;
alter table public.opsfusion_audit_events add column if not exists actor_email text;
update public.opsfusion_audit_events a set actor_name=coalesce(nullif(p.display_name,''),u.email),actor_email=u.email from auth.users u left join public.opsfusion_profiles p on p.user_id=u.id where a.actor_id=u.id and a.actor_name is null;
create or replace function opsfusion_staff_private.audit_actor_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select coalesce(nullif(p.display_name,''),u.email),u.email into new.actor_name,new.actor_email from auth.users u left join public.opsfusion_profiles p on p.user_id=u.id where u.id=new.actor_id;
 return new;
end $$;
revoke all on function opsfusion_staff_private.audit_actor_snapshot() from public,anon,authenticated;
drop trigger if exists opsfusion_audit_actor_snapshot on public.opsfusion_audit_events;
create trigger opsfusion_audit_actor_snapshot before insert on public.opsfusion_audit_events for each row execute function opsfusion_staff_private.audit_actor_snapshot();

create or replace function public.opsfusion_can_edit(p_workspace uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.opsfusion_workspaces w where w.id=p_workspace and (w.owner_id=auth.uid() or exists(select 1 from public.opsfusion_memberships m where m.workspace_id=w.id and m.user_id=auth.uid() and m.role in ('admin','technician'))))
$$;
revoke all on function public.opsfusion_can_edit(uuid) from public,anon;
grant execute on function public.opsfusion_can_edit(uuid) to authenticated,service_role;
alter policy opsfusion_automation_settings_edit on public.opsfusion_automation_settings using(public.opsfusion_can_edit(workspace_id)) with check(public.opsfusion_can_edit(workspace_id));
alter policy opsfusion_automation_alert_ack on public.opsfusion_automation_alerts using(public.opsfusion_can_edit(workspace_id)) with check(public.opsfusion_can_edit(workspace_id));
alter policy owner_read_tool_proposals on public.opsfusion_tool_proposals using(requested_by=auth.uid() and public.opsfusion_can_edit(workspace_id));

create or replace function public.opsfusion_review_tool(p_proposal_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.opsfusion_tool_proposals%rowtype; w public.opsfusion_workspaces%rowtype;
 n integer; t jsonb; a jsonb; changed jsonb; who uuid:=auth.uid();
begin
 if who is null then raise exception 'Sign in required'; end if;
 if p_decision not in ('approve','reject') or p_decision is null then raise exception 'Invalid decision'; end if;
 select * into p from public.opsfusion_tool_proposals where id=p_proposal_id for update;
 if not found or p.requested_by<>who then raise exception 'Proposal unavailable'; end if;
 select * into w from public.opsfusion_workspaces where id=p.workspace_id for update;
 if not found or not public.opsfusion_can_edit(w.id) then raise exception 'Proposal unavailable'; end if;
 if p.status<>'pending' then return jsonb_build_object('id',p.id,'status',p.status,'ticket_id',p.ticket_id); end if;
 if p_decision='reject' then
  update public.opsfusion_tool_proposals set status='rejected',decided_at=now() where id=p.id;
  insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail)
   values(w.id,who,'AI Tools','Tool proposal rejected',p.ticket_id,'Proposal '||p.id);
  return jsonb_build_object('id',p.id,'status','rejected','ticket_id',p.ticket_id);
 end if;
 if p.expires_at<=clock_timestamp() then
  update public.opsfusion_tool_proposals set status='expired',decided_at=now() where id=p.id;
  return jsonb_build_object('id',p.id,'status','expired','ticket_id',p.ticket_id);
 end if;
 if w.updated_at<>p.expected_updated_at then
  update public.opsfusion_tool_proposals set status='stale',decided_at=now() where id=p.id;
  return jsonb_build_object('id',p.id,'status','stale','ticket_id',p.ticket_id);
 end if;
 if p.tool_name<>'add_work_note' or (select count(*) from jsonb_object_keys(p.arguments))<>1
  or jsonb_typeof(p.arguments->'note')<>'string' or length(btrim(p.arguments->>'note')) not between 1 and 1200 then
  raise exception 'Invalid tool arguments';
 end if;
 select ord::integer-1,value into n,t from jsonb_array_elements(w.state->'incidents') with ordinality as x(value,ord) where value->>'id'=p.ticket_id;
 if t is null then raise exception 'Ticket missing'; end if;
 a=jsonb_build_object('at',now(),'actor','Approved AI tool','action','Work note','note',p.arguments->>'note','proposalId',p.id);
 t=jsonb_set(t,'{activities}',coalesce(t->'activities','[]'::jsonb)||jsonb_build_array(a));
 t=jsonb_set(t,'{updatedAt}',to_jsonb(now()));
 changed=jsonb_set(w.state,array['incidents',n::text],t);
 update public.opsfusion_workspaces set state=changed,updated_at=clock_timestamp() where id=w.id;
 update public.opsfusion_tool_proposals set status='executed',decided_at=now() where id=p.id;
 insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail)
 values(w.id,who,'AI Tools','Approved tool executed',p.ticket_id,'add_work_note; proposal '||p.id||'; model '||p.model);
 return jsonb_build_object('id',p.id,'status','executed','ticket_id',p.ticket_id);
end;
$$;
