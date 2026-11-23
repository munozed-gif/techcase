-- Login activity log, last activity per user, admin force sign-out, session security settings.
-- Nothing is removed: sessions are ended by expiring them (auth.sessions.not_after) and revoking their
-- refresh tokens, which Supabase Auth honours on the next refresh.

-- ── Tables ─────────────────────────────────────────────────────────────────────
create table if not exists public.login_events (
  id          bigserial primary key,
  user_id     uuid not null,
  session_id  uuid,
  event       text not null check (event in ('signed_in','signed_out','timed_out','forced_out')),
  ip          text,
  user_agent  text,
  remember    boolean,
  actor_id    uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists login_events_user_idx    on public.login_events (user_id, created_at desc);
create index if not exists login_events_created_idx on public.login_events (created_at desc);
create index if not exists login_events_session_idx on public.login_events (session_id);
alter table public.login_events enable row level security;

create table if not exists public.user_activity (
  user_id         uuid primary key,
  last_active_at  timestamptz not null default now(),
  last_session_id uuid,
  last_user_agent text
);
alter table public.user_activity enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='login_events' and policyname='login_events_admin_read') then
    create policy login_events_admin_read on public.login_events for select using (public.get_my_role()::text = 'admin');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_activity' and policyname='user_activity_admin_read') then
    create policy user_activity_admin_read on public.user_activity for select using (public.get_my_role()::text = 'admin');
  end if;
end $$;
-- Writes only through the functions below (no insert/update policies).

-- ── Record every sign-in straight from Supabase Auth (any method: password, link, invite) ──
-- Never lets a logging problem break sign-in: every error is swallowed.
create or replace function public._login_events_from_session()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  begin
    insert into public.login_events (user_id, session_id, event, ip, user_agent)
    values (new.user_id, new.id, 'signed_in', host(new.ip), left(new.user_agent, 400));
  exception when others then null;
  end;
  return null;
end $$;

create or replace trigger arena_login_events_ins after insert on auth.sessions
  for each row execute function public._login_events_from_session();

-- ── Helpers ────────────────────────────────────────────────────────────────────
create or replace function public._current_session_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

-- App → "I'm still here". Also tells the app when its session was ended by an admin or expired.
create or replace function public.session_touch()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); sid uuid := public._current_session_id(); s record;
begin
  if uid is null then return jsonb_build_object('ok', false); end if;
  insert into public.user_activity (user_id, last_active_at, last_session_id)
  values (uid, now(), sid)
  on conflict (user_id) do update set last_active_at = now(), last_session_id = excluded.last_session_id;
  if sid is not null then
    select id, not_after into s from auth.sessions where id = sid;
    if not found or (s.not_after is not null and s.not_after <= now()) then
      return jsonb_build_object('ok', true, 'ended', true);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'ended', false);
end $$;

-- Same check without counting as activity (idle tabs still notice a forced sign-out).
create or replace function public.session_check()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare sid uuid := public._current_session_id(); s record;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false); end if;
  if sid is not null then
    select id, not_after into s from auth.sessions where id = sid;
    if not found or (s.not_after is not null and s.not_after <= now()) then
      return jsonb_build_object('ok', true, 'ended', true);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'ended', false);
end $$;

-- App → record why this session is ending (before it calls signOut), or that it's a remembered device.
create or replace function public.session_log(p_event text, p_remember boolean default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); sid uuid := public._current_session_id(); s record;
begin
  if uid is null then return; end if;
  if p_event = 'remember' then
    update public.login_events set remember = coalesce(p_remember, true)
     where session_id = sid and user_id = uid and event = 'signed_in';
    return;
  end if;
  if p_event not in ('signed_out', 'timed_out') then raise exception 'invalid event'; end if;
  select ip, user_agent into s from auth.sessions where id = sid;
  insert into public.login_events (user_id, session_id, event, ip, user_agent)
  values (uid, sid, p_event, host(s.ip), left(s.user_agent, 400));
end $$;

-- ── Admin: overview, history, force sign-out ───────────────────────────────────
create or replace function public.admin_login_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then raise exception 'not allowed'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.last_active_at desc nulls last, x.full_name)
    from (
      select u.id, u.full_name, u.email, u.role::text as role,
             greatest(au.last_sign_in_at, (select max(created_at) from public.login_events e where e.user_id = u.id and e.event = 'signed_in')) as last_sign_in_at,
             a.last_active_at,
             (select count(*) from auth.sessions s where s.user_id = u.id and (s.not_after is null or s.not_after > now())) as open_sessions,
             (select jsonb_agg(jsonb_build_object('id', s.id, 'started', s.created_at, 'refreshed', coalesce(s.refreshed_at, s.updated_at),
                                                  'ip', host(s.ip), 'user_agent', left(s.user_agent, 400),
                                                  'remember', (select bool_or(e.remember) from public.login_events e where e.session_id = s.id))
                       order by coalesce(s.refreshed_at, s.updated_at) desc)
                from auth.sessions s where s.user_id = u.id and (s.not_after is null or s.not_after > now())) as sessions
      from public.users u
      left join auth.users au on au.id = u.id
      left join public.user_activity a on a.user_id = u.id
    ) x), '[]'::jsonb);
end $$;

create or replace function public.admin_login_history(p_user uuid default null, p_limit int default 200, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then raise exception 'not allowed'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select e.id, e.user_id, u.full_name, u.email, u.role::text as role, e.session_id, e.event, e.ip, e.user_agent,
             e.remember, e.created_at, e.actor_id, ac.full_name as actor_name
      from public.login_events e
      left join public.users u  on u.id  = e.user_id
      left join public.users ac on ac.id = e.actor_id
      where (p_user is null or e.user_id = p_user)
        and (p_before is null or e.created_at < p_before)
      order by e.created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x), '[]'::jsonb);
end $$;

-- Ends every open session of a user: expires the sessions and revokes their refresh tokens, so no
-- device can renew its sign-in. Open tabs notice within ~2 minutes (session_touch) and sign out.
create or replace function public.admin_force_sign_out(p_user uuid)
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int := 0; s record;
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then raise exception 'not allowed'; end if;
  for s in select id, ip, user_agent from auth.sessions where user_id = p_user and (not_after is null or not_after > now()) loop
    insert into public.login_events (user_id, session_id, event, ip, user_agent, actor_id)
    values (p_user, s.id, 'forced_out', host(s.ip), left(s.user_agent, 400), auth.uid());
    n := n + 1;
  end loop;
  update auth.sessions set not_after = now() where user_id = p_user and (not_after is null or not_after > now());
  update auth.refresh_tokens set revoked = true, updated_at = now() where user_id = p_user::text and revoked is not true;
  return n;
end $$;

revoke all on function public._login_events_from_session() from public, anon, authenticated;
revoke all on function public.session_touch() from public, anon;
revoke all on function public.session_check() from public, anon;
revoke all on function public.session_log(text, boolean) from public, anon;
revoke all on function public.admin_login_overview() from public, anon;
revoke all on function public.admin_login_history(uuid, int, timestamptz) from public, anon;
revoke all on function public.admin_force_sign_out(uuid) from public, anon;
grant execute on function public.session_touch() to authenticated;
grant execute on function public.session_check() to authenticated;
grant execute on function public.session_log(text, boolean) to authenticated;
grant execute on function public.admin_login_overview() to authenticated;
grant execute on function public.admin_login_history(uuid, int, timestamptz) to authenticated;
grant execute on function public.admin_force_sign_out(uuid) to authenticated;

-- ── Default settings (per-role inactivity limits in minutes; 0 = never) ────────
insert into public.system_settings (key, value)
values ('session_security', jsonb_build_object(
  'enabled', false, 'warn_seconds', 60, 'allow_remember', true,
  'roles', jsonb_build_object(
    'admin', 240, 'manager', 240, 'area_leader', 240, 'dispatch', 240,
    'consultant', 120, 'headhunter', 120,
    'client', 60, 'key_user', 60, 'project_manager', 60, 'internal_consultant', 60, 'final_user', 30, 'invited_client', 30)))
on conflict (key) do nothing;
