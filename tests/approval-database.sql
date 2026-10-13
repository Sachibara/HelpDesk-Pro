begin;
do $test$
declare owner uuid; stranger uuid; wid uuid:=gen_random_uuid(); pid uuid; expired_id uuid; stale_id uuid; rejected_id uuid;
 stamp timestamptz; result jsonb; cnt integer; denied boolean:=false;
begin
 select id into owner from auth.users order by created_at limit 1;
 select id into stranger from auth.users where id<>owner order by created_at limit 1;
 if owner is null or stranger is null then raise exception 'Two existing account IDs required for isolated tests'; end if;
 insert into public.opsfusion_workspaces(id,owner_id,name,state)
 values(wid,owner,'ROLLBACK ONLY approval test', '{"incidents":[{"id":"INC-TEST","title":"Test","status":"New","activities":[]}],"assets":[],"endpoints":[],"identities":[]}'::jsonb);
 select updated_at into stamp from public.opsfusion_workspaces where id=wid;
 insert into public.opsfusion_tool_proposals(workspace_id,requested_by,ticket_id,tool_name,arguments,model,expected_updated_at)
 values(wid,owner,'INC-TEST','add_work_note','{"note":"Proposed: verify camera settings."}','test-fixture',stamp) returning id into pid;
 if (select jsonb_array_length(state->'incidents'->0->'activities') from public.opsfusion_workspaces where id=wid)<>0 then raise exception 'Proposal mutated ticket'; end if;
 perform set_config('request.jwt.claim.sub',stranger::text,true);
 begin perform public.opsfusion_review_tool(pid,'approve'); exception when others then denied=true; end;
 if not denied then raise exception 'Foreign owner was accepted'; end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 result=public.opsfusion_review_tool(pid,'approve');
 if result->>'status'<>'executed' then raise exception 'Approval failed %',result; end if;
 result=public.opsfusion_review_tool(pid,'approve');
 select jsonb_array_length(state->'incidents'->0->'activities') into cnt from public.opsfusion_workspaces where id=wid;
 if cnt<>1 then raise exception 'Replay duplicated note'; end if;
 if (select count(*) from public.opsfusion_audit_events where workspace_id=wid and action='Approved tool executed')<>1 then raise exception 'Audit not atomic/idempotent'; end if;
 select updated_at into stamp from public.opsfusion_workspaces where id=wid;
 insert into public.opsfusion_tool_proposals(workspace_id,requested_by,ticket_id,tool_name,arguments,model,expected_updated_at,expires_at)
 values(wid,owner,'INC-TEST','add_work_note','{"note":"Expired note"}','test-fixture',stamp,now()-interval '1 minute') returning id into expired_id;
 if public.opsfusion_review_tool(expired_id,'approve')->>'status'<>'expired' then raise exception 'Expiry not enforced'; end if;
 insert into public.opsfusion_tool_proposals(workspace_id,requested_by,ticket_id,tool_name,arguments,model,expected_updated_at)
 values(wid,owner,'INC-TEST','add_work_note','{"note":"Stale note"}','test-fixture',stamp-interval '1 minute') returning id into stale_id;
 if public.opsfusion_review_tool(stale_id,'approve')->>'status'<>'stale' then raise exception 'Version check not enforced'; end if;
 insert into public.opsfusion_tool_proposals(workspace_id,requested_by,ticket_id,tool_name,arguments,model,expected_updated_at)
 values(wid,owner,'INC-TEST','add_work_note','{"note":"Rejected note"}','test-fixture',stamp) returning id into rejected_id;
 if public.opsfusion_review_tool(rejected_id,'reject')->>'status'<>'rejected' then raise exception 'Reject failed'; end if;
 if public.opsfusion_review_tool(rejected_id,'approve')->>'status'<>'rejected' then raise exception 'Rejected replay executed'; end if;
 if (select jsonb_array_length(state->'incidents'->0->'activities') from public.opsfusion_workspaces where id=wid)<>1 then raise exception 'Non-approved note saved'; end if;
 if has_table_privilege('authenticated','public.opsfusion_tool_proposals','INSERT') or has_table_privilege('authenticated','public.opsfusion_tool_proposals','UPDATE') then raise exception 'Client can tamper with proposal'; end if;
 if has_function_privilege('anon','public.opsfusion_review_tool(uuid,text)','EXECUTE') then raise exception 'Anonymous execution allowed'; end if;
end $test$;
rollback;
select 'PASS: pending does not mutate, owner authorization, atomic approval/audit, replay safety, expiry, stale version, rejection, immutable client grants, anonymous denial. Fixtures rolled back.' as verification;

