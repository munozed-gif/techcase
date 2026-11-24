-- A team application names a consultant per role (role_assignments). Accepting it assigned only the
-- applicant, so the other members never joined the case team. When an application becomes
-- accepted, every member in role_assignments is now assigned (once) and notified, whichever screen
-- accepted it. Applications already accepted are repaired.
create or replace function public.applications_assign_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare m uuid; v_title text;
begin
  if new.status::text <> 'accepted' or (tg_op = 'UPDATE' and old.status::text = 'accepted') then return new; end if;
  if jsonb_typeof(new.role_assignments::jsonb) <> 'array' then return new; end if;
  select title into v_title from cases where id = new.case_id;
  for m in select distinct (r->>'consultant_id')::uuid from jsonb_array_elements(new.role_assignments::jsonb) r
            where coalesce(r->>'consultant_id', '') ~ '^[0-9a-f-]{36}$' loop
    if m is distinct from new.consultant_id
       and not exists (select 1 from case_assignments a where a.case_id = new.case_id and a.consultant_id = m
                         and coalesce(a.is_active, true) and a.unassigned_at is null and a.released_at is null) then
      insert into case_assignments (case_id, consultant_id, time_commitment) values (new.case_id, m, new.time_commitment);
      insert into notifications (user_id, title, body, is_read, event_type, case_id)
      values (m, 'Assigned to a case', format('Your team''s application was accepted — you are assigned to "%s".', v_title), false, 'case_assignment', new.case_id);
    end if;
  end loop;
  return new;
end $$;

create or replace trigger applications_assign_team
  after insert or update of status on public.applications
  for each row execute function public.applications_assign_team();
revoke execute on function public.applications_assign_team() from public, anon, authenticated;

-- Repair: members of accepted team applications who were never assigned.
insert into public.case_assignments (case_id, consultant_id, time_commitment)
select distinct a.case_id, (r->>'consultant_id')::uuid, a.time_commitment
  from public.applications a, jsonb_array_elements(a.role_assignments::jsonb) r
 where a.status::text = 'accepted' and jsonb_typeof(a.role_assignments::jsonb) = 'array'
   and coalesce(r->>'consultant_id', '') ~ '^[0-9a-f-]{36}$'
   and (r->>'consultant_id')::uuid is distinct from a.consultant_id
   and not exists (select 1 from public.case_assignments x where x.case_id = a.case_id and x.consultant_id = (r->>'consultant_id')::uuid);
