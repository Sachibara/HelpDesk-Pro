begin;
do $test$
declare portal uuid:=gen_random_uuid(); owner uuid:=gen_random_uuid(); wid uuid; denied boolean;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(portal,'portal-'||portal||'@example.invalid',now(),'{}'),(owner,'owner-'||owner||'@example.invalid',now(),'{"create_workspace":true}');
 -- A profile update cannot rewrite the server-captured registration kind.
 update auth.users set raw_user_meta_data='{"create_workspace":true}' where id=portal;
 perform set_config('request.jwt.claim.sub',portal::text,true);execute 'set local role authenticated';
 denied:=false;begin perform public.opsfusion_create_workspace('Forbidden');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Portal account created IT workspace';end if;
 if exists(select 1 from public.opsfusion_workspaces) then raise exception 'Unapproved portal account sees IT workspaces';end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 wid:=(public.opsfusion_create_workspace('Owner signup')->>'id')::uuid;
 perform public.opsfusion_staff_access('grant',wid,jsonb_build_object('email','portal-'||portal||'@example.invalid','role','technician'));
 perform set_config('request.jwt.claim.sub',portal::text,true);
 if not public.opsfusion_can_edit(wid) then raise exception 'Explicitly added member denied';end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform public.opsfusion_staff_access('revoke',wid,jsonb_build_object('user_id',portal));
 perform set_config('request.jwt.claim.sub',portal::text,true);
 if exists(select 1 from public.opsfusion_workspaces) then raise exception 'Removed portal member retains IT access';end if;
 execute 'reset role';
end $test$;
rollback;
select 'PASS: portal-only access denied, metadata escalation denied, owner signup allowed, explicit membership grants access, removal revokes access. Fixtures rolled back.' as verification;
