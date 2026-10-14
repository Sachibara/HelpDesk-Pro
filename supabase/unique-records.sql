-- Workspace-scoped duplicate protection. Existing duplicate groups may shrink,
-- but cannot gain records. No existing data is modified by this migration.
create or replace function public.opsfusion_guard_unique_records()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare spec record; duplicate record; old_ids jsonb; prior jsonb;
begin
  prior := case when TG_OP='UPDATE' then OLD.state else '{}'::jsonb end;
  for spec in select * from (values
    ('identities','id','identity ID'),('identities','displayName','identity full name'),
    ('identities','username','identity username'),('identities','upn','identity email identifier'),
    ('assets','id','asset ID'),('assets','tag','asset tag'),('assets','hostname','asset name'),
    ('assets','serial','asset serial'),('assets','endpointId','asset linked endpoint')
  ) v(collection,field,label) loop
    for duplicate in
      select k, jsonb_agg(e->>'id') ids from (
        select e, lower(trim(regexp_replace(normalize(coalesce(e->>spec.field,''),NFKC),'\s+',' ','g'))) k
        from jsonb_array_elements(coalesce(NEW.state->spec.collection,'[]'::jsonb)) e
      ) values_normalized
      where k<>'' and not (spec.field='serial' and k in ('—','-','n/a','unknown'))
      group by k having count(*)>1
    loop
      select coalesce(jsonb_agg(e->>'id'),'[]'::jsonb) into old_ids
      from jsonb_array_elements(coalesce(prior->spec.collection,'[]'::jsonb)) e
      where lower(trim(regexp_replace(normalize(coalesce(e->>spec.field,''),NFKC),'\s+',' ','g')))=duplicate.k;
      if spec.field='id' or not (old_ids @> duplicate.ids) then
        raise exception 'Duplicate %: open the existing record instead.',spec.label using errcode='23505';
      end if;
    end loop;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(coalesce(NEW.state->'assets','[]')) n
    join jsonb_array_elements(coalesce(prior->'assets','[]')) o on n->>'id'=o->>'id'
    where o->>'status'='Assigned' and n->>'status'='Assigned'
      and (n->>'assignedUserId') is distinct from (o->>'assignedUserId')
  ) then
    raise exception 'Asset is already assigned. Release it to Available and save before assigning it to another person.' using errcode='23514';
  end if;
  return NEW;
end $$;
revoke all on function public.opsfusion_guard_unique_records() from public, anon, authenticated;
create trigger opsfusion_unique_records_guard before insert or update of state
on public.opsfusion_workspaces for each row execute function public.opsfusion_guard_unique_records();
