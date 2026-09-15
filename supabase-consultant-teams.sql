-- consultant_teams: groups of consultants that apply together
create table if not exists consultant_teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- consultant_team_members: membership rows (owner + invited members)
create table if not exists consultant_team_members (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references consultant_teams(id) on delete cascade,
  user_id      uuid references users(id) on delete set null,
  email        text not null,
  role         text not null default 'member' check (role in ('owner','member')),
  status       text not null default 'pending' check (status in ('pending','accepted','declined')),
  invited_at   timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists consultant_team_members_team_id_idx on consultant_team_members(team_id);
create index if not exists consultant_team_members_user_id_idx on consultant_team_members(user_id);
create index if not exists consultant_team_members_email_idx   on consultant_team_members(email);

alter table consultant_teams        enable row level security;
alter table consultant_team_members enable row level security;

-- Security-definer helpers break the circular-reference between the two tables
create or replace function _is_team_member(p_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from consultant_team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create or replace function _is_team_owner(p_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from consultant_team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- consultant_teams policies
create policy "teams_select" on consultant_teams for select using (_is_team_member(id));
create policy "teams_insert" on consultant_teams for insert with check (created_by = auth.uid());
create policy "teams_update" on consultant_teams for update using (created_by = auth.uid());
create policy "teams_delete" on consultant_teams for delete using (created_by = auth.uid());

-- consultant_team_members policies
create policy "members_select"
  on consultant_team_members for select
  using (user_id = auth.uid() or _is_team_owner(team_id));

create policy "members_insert"
  on consultant_team_members for insert
  with check ((user_id = auth.uid() and role = 'owner') or _is_team_owner(team_id));

create policy "members_update"
  on consultant_team_members for update
  using (user_id = auth.uid() or _is_team_owner(team_id));

create policy "members_delete"
  on consultant_team_members for delete
  using (user_id = auth.uid() or _is_team_owner(team_id));
