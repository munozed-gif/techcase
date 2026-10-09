-- ============================================================
-- Migration: Data Migration Tracker, Simplification Items,
--            SLA Profiles & Tracking
-- ============================================================

-- ─── data_migration_objects ───────────────────────────────────
create table if not exists data_migration_objects (
  id                    uuid default gen_random_uuid() primary key,
  migration_project_id  uuid references migration_projects(id) on delete cascade,
  name                  text not null,
  sap_object            text,
  category              text check (category in ('Master Data','Transactional','Configuration','Basis')),
  record_count_source   integer,
  owner_id              uuid references users(id),
  mapping_status        text default 'not_started' check (mapping_status in ('not_started','in_progress','completed')),
  quality_issues        integer default 0,
  mock_run_1_pct        numeric(5,2),
  mock_run_1_errors     integer,
  mock_run_2_pct        numeric(5,2),
  mock_run_2_errors     integer,
  go_live_pct           numeric(5,2),
  go_live_errors        integer,
  go_no_go              boolean default false,
  notes                 text,
  created_at            timestamptz default now()
);

alter table data_migration_objects enable row level security;
create policy "auth users can manage data_migration_objects"
  on data_migration_objects for all to authenticated
  using (true) with check (true);

-- ─── data_quality_issues ──────────────────────────────────────
create table if not exists data_quality_issues (
  id              uuid default gen_random_uuid() primary key,
  data_object_id  uuid references data_migration_objects(id) on delete cascade,
  title           text not null,
  description     text,
  severity        text default 'medium' check (severity in ('critical','high','medium','low')),
  status          text default 'open'   check (status   in ('open','in_progress','resolved')),
  owner_id        uuid references users(id),
  resolved_at     timestamptz,
  created_at      timestamptz default now()
);

alter table data_quality_issues enable row level security;
create policy "auth users can manage data_quality_issues"
  on data_quality_issues for all to authenticated
  using (true) with check (true);

-- ─── simplification_items ─────────────────────────────────────
create table if not exists simplification_items (
  id                   uuid default gen_random_uuid() primary key,
  migration_project_id uuid references migration_projects(id) on delete cascade,
  item_id              text,
  title                text not null,
  area                 text default 'Other' check (area in ('FI','MM','SD','PP','HR','Basis','Technical','Other')),
  impact               text default 'informational' check (impact in ('mandatory_change','optional','informational')),
  description          text,
  affected_objects     text,
  remediation_notes    text,
  status               text default 'open' check (status in ('not_applicable','open','in_progress','resolved')),
  owner_id             uuid references users(id),
  resolved_at          timestamptz,
  created_at           timestamptz default now()
);

alter table simplification_items enable row level security;
create policy "auth users can manage simplification_items"
  on simplification_items for all to authenticated
  using (true) with check (true);

-- ─── sla_profiles ─────────────────────────────────────────────
create table if not exists sla_profiles (
  id                   uuid default gen_random_uuid() primary key,
  name                 text not null,
  priority_level       integer check (priority_level between 1 and 4),
  description          text,
  first_response_hours numeric not null,
  resolution_hours     numeric not null,
  applies_to_roles     text[] default '{"all"}',
  color                text default '#6366f1',
  is_active            boolean default true,
  created_at           timestamptz default now()
);

alter table sla_profiles enable row level security;
create policy "auth users can manage sla_profiles"
  on sla_profiles for all to authenticated
  using (true) with check (true);

-- ─── sla_tracking ─────────────────────────────────────────────
create table if not exists sla_tracking (
  id                      uuid default gen_random_uuid() primary key,
  case_id                 uuid references cases(id) on delete cascade,
  profile_id              uuid references sla_profiles(id),
  assigned_at             timestamptz default now(),
  first_response_at       timestamptz,
  resolved_at             timestamptz,
  first_response_breached boolean default false,
  resolution_breached     boolean default false,
  breach_notified_at      timestamptz
);

alter table sla_tracking enable row level security;
create policy "auth users can manage sla_tracking"
  on sla_tracking for all to authenticated
  using (true) with check (true);
