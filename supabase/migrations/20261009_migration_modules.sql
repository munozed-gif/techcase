-- ============================================================
-- TechCase: Migration Modules
-- Adds tables for SAP Activate phase gates, WRICEF registry,
-- and cutover planner.
-- ============================================================

-- Migration projects metadata
create table if not exists migration_projects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  approach text check (approach in ('greenfield','brownfield','bluefield')) default 'brownfield',
  source_version text,
  target_version text default 'SAP S/4HANA 2023',
  go_live_date date,
  current_phase text default 'discover',
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Phase deliverables (one row per deliverable per project)
create table if not exists migration_phase_deliverables (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  phase text not null,
  title text not null,
  completed boolean default false,
  completed_by uuid references users(id),
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Phase gate approvals
create table if not exists migration_phase_gates (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  phase text not null,
  status text default 'not_started' check (status in ('not_started','in_progress','completed')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  notes text,
  unique(migration_project_id, phase)
);

-- WRICEF objects
create table if not exists wricef_objects (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  type text not null check (type in ('W','R','I','C','E','F')),
  name text not null,
  object_id text,
  description text,
  complexity text default 'medium' check (complexity in ('low','medium','high')),
  effort_days numeric(6,1),
  owner_id uuid references users(id),
  remediation_approach text,
  status text default 'open' check (status in ('open','in_progress','remediated','tested','signed_off')),
  signed_off_by uuid references users(id),
  signed_off_at timestamptz,
  created_at timestamptz default now()
);

-- Cutover runs (DR1, DR2, Go-Live)
create table if not exists cutover_runs (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  run_type text not null check (run_type in ('dr1','dr2','go_live')),
  scheduled_date timestamptz,
  system_freeze_date timestamptz,
  downtime_start timestamptz,
  downtime_end timestamptz,
  status text default 'planned' check (status in ('planned','in_progress','completed')),
  go_no_go text check (go_no_go in ('go','no_go')),
  go_no_go_by uuid references users(id),
  go_no_go_at timestamptz,
  notes text
);

-- Cutover tasks
create table if not exists cutover_tasks (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  seq integer not null,
  title text not null,
  team text,
  owner_id uuid references users(id),
  duration_hours numeric(5,1),
  depends_on integer,
  run_type text default 'all' check (run_type in ('dr1','dr2','go_live','all')),
  status text default 'pending' check (status in ('pending','in_progress','done','skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now()
);
