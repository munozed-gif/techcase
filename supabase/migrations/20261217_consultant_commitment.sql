-- One availability rule for every screen: case commitment = time_commitment of the consultant's
-- active assignments (not released / unassigned) on cases that are not finished; free = 100 -
-- cases - external occupancy. The profile showed cases as 0% (hard-coded) while the team
-- assignment screen added released assignments too, so the two disagreed.
create or replace function public.consultant_commitment(p_ids uuid[])
returns table (consultant_id uuid, cases_pct numeric, external_pct numeric, free_pct numeric)
language sql stable security definer set search_path = public as $$
  with ids as (select unnest(p_ids) as id),
  cases_sum as (
    select a.consultant_id, sum(coalesce(nullif(a.time_commitment::text, '')::numeric, 0)) as pct
      from case_assignments a join cases c on c.id = a.case_id
     where a.consultant_id = any(p_ids)
       and coalesce(a.is_active, true) and a.unassigned_at is null and a.released_at is null
       and coalesce(c.status::text, '') not in ('completed', 'cancelled', 'terminated', 'closed', 'approved', 'resolved')
     group by a.consultant_id)
  select i.id, coalesce(cs.pct, 0), coalesce(cp.external_occupancy_pct, 0)::numeric,
         greatest(0, 100 - coalesce(cs.pct, 0) - coalesce(cp.external_occupancy_pct, 0))::numeric
    from ids i left join cases_sum cs on cs.consultant_id = i.id
    left join consultant_profiles cp on cp.id = i.id
   where auth.uid() is not null;
$$;
revoke execute on function public.consultant_commitment(uuid[]) from public, anon;
grant execute on function public.consultant_commitment(uuid[]) to authenticated, service_role;
