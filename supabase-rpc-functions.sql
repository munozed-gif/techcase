-- RPC functions used by the app
-- Run this after the base schema is applied.

-- ── check_team_registration ───────────────────────────────────────────────────
-- Called from the signup screen (unauthenticated) to detect whether an email
-- has been pre-registered as a client-team member so the UI can show the
-- correct role context.  SECURITY DEFINER bypasses RLS for this read-only check.
create or replace function public.check_team_registration(email_to_check text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json := '{}'::json;
  v_key_user_row    record;
  v_final_user_row  record;
  v_int_cons_row    record;
  v_pm_row          record;
begin
  -- key_user: stored with role = 'key_user' in client_team_members
  select ctm.client_id, cp.company_name, ctm.name
    into v_key_user_row
    from client_team_members ctm
    left join client_profiles cp on cp.id = ctm.client_id
    where lower(ctm.email) = lower(email_to_check)
      and ctm.role = 'key_user'
    limit 1;

  -- final_user
  select ctm.client_id, cp.company_name, ctm.name
    into v_final_user_row
    from client_team_members ctm
    left join client_profiles cp on cp.id = ctm.client_id
    where lower(ctm.email) = lower(email_to_check)
      and ctm.role = 'final_user'
    limit 1;

  -- internal_consultant
  select ctm.client_id, cp.company_name, ctm.name
    into v_int_cons_row
    from client_team_members ctm
    left join client_profiles cp on cp.id = ctm.client_id
    where lower(ctm.email) = lower(email_to_check)
      and ctm.role = 'internal_consultant'
    limit 1;

  -- project_manager
  select ctm.client_id, cp.company_name, ctm.name
    into v_pm_row
    from client_team_members ctm
    left join client_profiles cp on cp.id = ctm.client_id
    where lower(ctm.email) = lower(email_to_check)
      and ctm.role = 'project_manager'
    limit 1;

  if v_key_user_row is null
     and v_final_user_row is null
     and v_int_cons_row is null
     and v_pm_row is null then
    return null;
  end if;

  select json_build_object(
    'key_user_company',               v_key_user_row.company_name,
    'final_user_client_id',           v_final_user_row.client_id,
    'final_user_company',             v_final_user_row.company_name,
    'internal_consultant_client_id',  v_int_cons_row.client_id,
    'internal_consultant_company',    v_int_cons_row.company_name,
    'project_manager_client_id',      v_pm_row.client_id,
    'project_manager_company',        v_pm_row.company_name,
    'member_name',                    coalesce(
      v_key_user_row.name,
      v_final_user_row.name,
      v_int_cons_row.name,
      v_pm_row.name
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Grant unauthenticated callers (anon role) access so it works before sign-in
grant execute on function public.check_team_registration(text) to anon;
grant execute on function public.check_team_registration(text) to authenticated;


-- ── recalculate_trust_level ───────────────────────────────────────────────────
-- Fire-and-forget after a rating is submitted or a profile action occurs.
-- Computes an average score from case_ratings and stores it on users.trust_level.
create or replace function public.recalculate_trust_level(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg  numeric;
  v_count int;
begin
  select
    count(*),
    coalesce(
      avg(
        (select avg(v::numeric)
         from jsonb_each_text(scores) as kv(k, v)
         where v ~ '^\d+(\.\d+)?$')
      ), 0
    )
  into v_count, v_avg
  from case_ratings
  where ratee_id = p_user_id
    and ratee_role = 'consultant';

  -- trust_level is a 0-100 score; scale from 0-5 average ratings
  update users
  set trust_level = case
    when v_count = 0 then null
    else least(100, round((v_avg / 5.0) * 100))
  end
  where id = p_user_id;
end;
$$;

grant execute on function public.recalculate_trust_level(uuid) to authenticated;
grant execute on function public.recalculate_trust_level(uuid) to service_role;


-- ── get_consultant_availability ───────────────────────────────────────────────
-- Returns the availability data stored in consultant_profiles for a given user.
-- Wraps the row so callers get a stable JSON shape.
create or replace function public.get_consultant_availability(p_consultant_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row consultant_profiles%rowtype;
begin
  select * into v_row
  from consultant_profiles
  where id = p_consultant_id;

  if not found then
    return null;
  end if;

  return json_build_object(
    'available_from',        v_row.available_from,
    'availability_pct',      v_row.availability_pct,
    'external_occupancy_pct',v_row.external_occupancy_pct,
    'travel_available',      v_row.travel_available,
    'work_mode',             v_row.work_mode,
    'status',                case
      when v_row.availability_pct is null then 'unknown'
      when v_row.availability_pct = 0     then 'unavailable'
      when v_row.availability_pct <= 50   then 'limited'
      else 'available'
    end
  );
end;
$$;

grant execute on function public.get_consultant_availability(uuid) to authenticated;
grant execute on function public.get_consultant_availability(uuid) to service_role;
