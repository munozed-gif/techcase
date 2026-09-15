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
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references consultant_teams(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  email       text not null,
  role        text not null default 'member' check (role in ('owner','member')),
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  invited_at  timestamptz not null default now(),
  responded_at timestamptz
);

-- indexes for fast lookups
create index if not exists consultant_team_members_team_id_idx  on consultant_team_members(team_id);
create index if not exists consultant_team_members_user_id_idx  on consultant_team_members(user_id);
create index if not exists consultant_team_members_email_idx    on consultant_team_members(email);

-- RLS
alter table consultant_teams        enable row level security;
alter table consultant_team_members enable row level security;

-- Any authenticated user can read teams they belong to
create policy "members can read own teams"
  on consultant_teams for select
  using (
    exists (
      select 1 from consultant_team_members m
      where m.team_id = consultant_teams.id
        and m.user_id = auth.uid()
        and m.status  = 'accepted'
    )
  );

-- Any authenticated user can create a team
create policy "consultants can create teams"
  on consultant_teams for insert
  with check (created_by = auth.uid());

-- Only the team creator can update or delete
create policy "owner can update team"
  on consultant_teams for update
  using (created_by = auth.uid());

create policy "owner can delete team"
  on consultant_teams for delete
  using (created_by = auth.uid());

-- Members can read their own membership rows; owners can read all rows of their teams
create policy "read own membership or team memberships"
  on consultant_team_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from consultant_teams t
      where t.id = consultant_team_members.team_id
        and t.created_by = auth.uid()
    )
  );

-- Anyone can insert a member row (owner adds members, system responds to invites)
create policy "insert membership"
  on consultant_team_members for insert
  with check (
    -- inserter is the team owner
    exists (
      select 1 from consultant_teams t
      where t.id = team_id and t.created_by = auth.uid()
    )
    -- or the user is inserting their own owner row
    or (user_id = auth.uid() and role = 'owner')
  );

-- A member can update their own row (accept/decline); owner can update any row
create policy "update membership"
  on consultant_team_members for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from consultant_teams t
      where t.id = consultant_team_members.team_id
        and t.created_by = auth.uid()
    )
  );

-- A member can delete their own row (leave); owner can delete any row (remove member)
create policy "delete membership"
  on consultant_team_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from consultant_teams t
      where t.id = consultant_team_members.team_id
        and t.created_by = auth.uid()
    )
  );
