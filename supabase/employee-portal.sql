-- Employees have no workspace membership or raw workspace SELECT permission.
create table public.opsfusion_employee_access (
 workspace_id uuid not null references public.opsfusion_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 identity_id text not null,
 primary key(workspace_id,user_id), unique(workspace_id,identity_id)
);
create index opsfusion_employee_access_user_idx on public.opsfusion_employee_access(user_id);
alter table public.opsfusion_employee_access enable row level security;
revoke all on public.opsfusion_employee_access from public,anon,authenticated;
create or replace function opsfusion_private.employee_portal(p_action text,p_workspace uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); w public.opsfusion_workspaces%rowtype; identity text; target uuid;
 result jsonb; ticket jsonb; tickets jsonb; idx integer; stamp timestamptz:=clock_timestamp(); title text; body text; ticket_id text;
begin
 if who is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_action='workspaces' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name)) from public.opsfusion_employee_access a join public.opsfusion_workspaces s on s.id=a.workspace_id
   where a.user_id=who and exists(select 1 from jsonb_array_elements(coalesce(s.state->'identities','[]')) u where u->>'id'=a.identity_id and u->>'status'='Active')),'[]');
 end if;
 select * into w from public.opsfusion_workspaces where id=p_workspace for update;
 if not found then raise exception 'Workspace access denied' using errcode='42501'; end if;
 if p_action in ('access_list','grant','revoke') then
  if w.owner_id<>who then raise exception 'Workspace owner required' using errcode='42501'; end if;
  if p_action='access_list' then
   return coalesce((select jsonb_agg(jsonb_build_object('identity_id',a.identity_id,'email',u.email)) from public.opsfusion_employee_access a join auth.users u on u.id=a.user_id where a.workspace_id=w.id),'[]');
  end if;
  identity:=p_payload->>'identity_id';
  if p_action='grant' then
   if not exists(select 1 from jsonb_array_elements(coalesce(w.state->'identities','[]')) u where u->>'id'=identity and u->>'status'='Active') then raise exception 'Choose an active identity'; end if;
   select id into target from auth.users where lower(email)=lower(trim(p_payload->>'email')) and email_confirmed_at is not null;
   if target is null then raise exception 'A confirmed employee account with this email is required. Ask the employee to register and confirm their email first.'; end if;
   if target=w.owner_id or exists(select 1 from public.opsfusion_memberships where workspace_id=w.id and user_id=target) then raise exception 'This account already has staff access'; end if;
   insert into public.opsfusion_employee_access values(w.id,target,identity);
  else
   delete from public.opsfusion_employee_access where workspace_id=w.id and identity_id=identity;
  end if;
  insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(w.id,who,'Identity','Employee portal access '||p_action,identity,'Owner-managed portal enrollment');
  return jsonb_build_object('ok',true);
 end if;
 select a.identity_id into identity from public.opsfusion_employee_access a where a.workspace_id=w.id and a.user_id=who;
 if identity is null or not exists(select 1 from jsonb_array_elements(coalesce(w.state->'identities','[]')) u where u->>'id'=identity and u->>'status'='Active') then
  raise exception 'Employee access denied or identity inactive' using errcode='42501';
 end if;
 tickets:=coalesce(w.state->'incidents','[]');
 if p_action='tickets' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',t->>'id','title',t->>'title','description',t->>'description','status',t->>'status','priority',t->>'priority','createdAt',t->>'createdAt','updatedAt',t->>'updatedAt','messages',coalesce(t->'employeeMessages','[]')) order by t->>'createdAt' desc)
   from jsonb_array_elements(tickets) t where t->>'portalUserId'=who::text and t->>'requesterId'=identity),'[]');
 elsif p_action='create' then
  title:=trim(p_payload->>'title');body:=trim(p_payload->>'description');
  if coalesce(length(title),0) not between 5 and 180 or coalesce(length(body),0) not between 10 and 4000 then raise exception 'Title must be 5–180 characters and description 10–4000 characters'; end if;
  if (select count(*) from jsonb_array_elements(tickets) t where t->>'portalUserId'=who::text and (t->>'createdAt')::timestamptz>stamp-interval '1 day')>=20 then raise exception 'Daily ticket limit reached'; end if;
  ticket_id:='INC-'||gen_random_uuid()::text;
  ticket:=jsonb_build_object('id',ticket_id,'title',title,'description',body,'type','Incident','category','General','priority','P3','impact','Medium','urgency','Medium','status','New','source','Employee Portal','requesterId',identity,'portalUserId',who,'assigneeId','','assetId','','endpointId','','createdAt',stamp,'updatedAt',stamp,'responseDue',stamp+interval '4 hours','resolutionDue',stamp+interval '24 hours','firstResponseAt',null,'resolvedAt',null,'employeeMessages','[]'::jsonb,'activities',jsonb_build_array(jsonb_build_object('at',stamp,'actor','Employee Portal','action','Ticket created','note','Employee submitted a support request')));
  tickets:=jsonb_build_array(ticket)||tickets;
 elsif p_action='comment' then
  ticket_id:=p_payload->>'ticket_id';body:=trim(p_payload->>'body');
  if coalesce(length(body),0) not between 1 and 2000 then raise exception 'Reply must be 1–2000 characters'; end if;
  select t,ord::integer-1 into ticket,idx from jsonb_array_elements(tickets) with ordinality as x(t,ord) where t->>'id'=ticket_id and t->>'portalUserId'=who::text and t->>'requesterId'=identity;
  if ticket is null then raise exception 'Ticket access denied' using errcode='42501'; end if;
  if ticket->>'status' in ('Resolved','Closed') then raise exception 'Ticket is resolved or closed; submit a new request if more help is needed'; end if;
  if jsonb_array_length(coalesce(ticket->'employeeMessages','[]'))>=100 then raise exception 'Conversation limit reached'; end if;
  ticket:=jsonb_set(ticket,'{employeeMessages}',coalesce(ticket->'employeeMessages','[]')||jsonb_build_array(jsonb_build_object('author','Employee','body',body,'at',stamp)));
  ticket:=jsonb_set(ticket,'{updatedAt}',to_jsonb(stamp));tickets:=jsonb_set(tickets,array[idx::text],ticket);
 else raise exception 'Unknown portal action'; end if;
 update public.opsfusion_workspaces set state=jsonb_set(w.state,'{incidents}',tickets) where id=w.id;
 insert into public.opsfusion_audit_events(workspace_id,actor_id,module,action,target,detail) values(w.id,who,'Service Desk','Employee portal '||p_action,ticket_id,'Employee request saved');
 return jsonb_build_object('ok',true,'ticket_id',ticket_id);
end $$;
revoke all on function opsfusion_private.employee_portal(text,uuid,jsonb) from public,anon,authenticated;
create or replace function public.opsfusion_employee_portal(p_action text,p_workspace uuid default null,p_payload jsonb default '{}')
returns jsonb language sql security definer set search_path='' as $$select opsfusion_private.employee_portal(p_action,p_workspace,p_payload)$$;
revoke all on function public.opsfusion_employee_portal(text,uuid,jsonb) from public,anon;
grant execute on function public.opsfusion_employee_portal(text,uuid,jsonb) to authenticated;
