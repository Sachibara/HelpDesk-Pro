-- Approval-gated add_work_note tool. No existing records are reset.
begin;
create table public.opsfusion_tool_proposals (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.opsfusion_workspaces(id) on delete cascade,
 requested_by uuid not null references auth.users(id),
 ticket_id text not null,
 tool_name text not null check(tool_name='add_work_note'),
 arguments jsonb not null,
 model text not null,
 expected_updated_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','executed','rejected','expired','stale')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes',
 decided_at timestamptz,
 check(jsonb_typeof(arguments)='object' and jsonb_typeof(arguments->'note')='string'
   and length(arguments->>'note') between 1 and 1200)
);
create index opsfusion_tool_workspace_idx on public.opsfusion_tool_proposals(workspace_id,created_at desc);
create index opsfusion_tool_requester_idx on public.opsfusion_tool_proposals(requested_by);
alter table public.opsfusion_tool_proposals enable row level security;
revoke all on public.opsfusion_tool_proposals from public,anon,authenticated;
grant select on public.opsfusion_tool_proposals to authenticated;
grant all on public.opsfusion_tool_proposals to service_role;
create policy owner_read_tool_proposals on public.opsfusion_tool_proposals for select to authenticated
 using(requested_by=(select auth.uid()) and exists(select 1 from public.opsfusion_workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid())));

create function public.opsfusion_review_tool(p_proposal_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.opsfusion_tool_proposals%rowtype; w public.opsfusion_workspaces%rowtype;
 n integer; t jsonb; a jsonb; changed jsonb; who uuid:=auth.uid();
begin
 if who is null then raise exception 'Sign in required'; end if;
 if p_decision not in ('approve','reject') or p_decision is null then raise exception 'Invalid decision'; end if;
 select * into p from public.opsfusion_tool_proposals where id=p_proposal_id for update;
 if not found or p.requested_by<>who then raise exception 'Proposal unavailable'; end if;
 select * into w from public.opsfusion_workspaces where id=p.workspace_id for update;
 if not found or w.owner_id<>who then raise exception 'Proposal unavailable'; end if;
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
revoke all on function public.opsfusion_review_tool(uuid,text) from public,anon;
grant execute on function public.opsfusion_review_tool(uuid,text) to authenticated;
comment on function public.opsfusion_review_tool(uuid,text) is 'Owner-only approval executor; explicit auth.uid check, immutable stored arguments, row locks, expiry and workspace version check.';
commit;

