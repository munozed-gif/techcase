-- Names and avatars of the members of teams the caller owns or belongs to. The browser cannot read
-- other users' rows, so the team list showed only the e-mail of members who already had an account.
create or replace function public.team_member_people(p_team_ids uuid[])
returns table (id uuid, full_name text, avatar_url text, email text)
language sql stable security definer set search_path = public as $$
  select distinct u.id, u.full_name, u.avatar_url, u.email
    from consultant_team_members m
    join users u on u.id = m.user_id
   where m.team_id = any(p_team_ids)
     and (public._is_team_owner(m.team_id) or public._is_team_member(m.team_id)
          or exists (select 1 from consultant_teams t where t.id = m.team_id and t.created_by = auth.uid()));
$$;
revoke execute on function public.team_member_people(uuid[]) from public, anon;
grant execute on function public.team_member_people(uuid[]) to authenticated, service_role;
