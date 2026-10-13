-- ============================================================
-- Migration: Transport Request Manager, Fit-Gap Register,
--            Testing Cockpit
-- ============================================================

-- ─── transport_requests ───────────────────────────────────────
create table if not exists transport_requests (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  tr_number text not null,               -- e.g. DEV K900123
  description text,
  category text check (category in ('Workbench','Customizing','Transport of Copies')),
  owner_id uuid references users(id),
  status text default 'dev' check (status in ('dev','released','qa','prod','rejected')),
  released_at timestamptz,
  qa_imported_at timestamptz,
  prod_imported_at timestamptz,
  rejected_reason text,
  created_at timestamptz default now()
);

alter table transport_requests enable row level security;
create policy "auth users can manage transport_requests"
  on transport_requests for all to authenticated
  using (true) with check (true);

-- ─── fitgap_items ─────────────────────────────────────────────
create table if not exists fitgap_items (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  item_number text,                       -- e.g. FG-001
  process_area text,                      -- e.g. FI-GL, MM-PO
  description text not null,
  gap_type text default 'gap' check (gap_type in ('fit','gap','partial_fit')),
  priority text default 'medium' check (priority in ('high','medium','low')),
  resolution text check (resolution in ('standard','config','wricef','process_change','out_of_scope')),
  wricef_id uuid references wricef_objects(id),
  owner_id uuid references users(id),
  status text default 'open' check (status in ('open','in_progress','resolved','deferred')),
  notes text,
  created_at timestamptz default now()
);

alter table fitgap_items enable row level security;
create policy "auth users can manage fitgap_items"
  on fitgap_items for all to authenticated
  using (true) with check (true);

-- ─── test_scripts ─────────────────────────────────────────────
create table if not exists test_scripts (
  id uuid primary key default gen_random_uuid(),
  migration_project_id uuid references migration_projects(id) on delete cascade,
  script_id text,                         -- e.g. TS-FI-001
  title text not null,
  process_area text,
  test_type text default 'integration' check (test_type in ('unit','integration','uat','regression','performance')),
  assigned_to uuid references users(id),
  status text default 'not_started' check (status in ('not_started','in_progress','passed','failed','blocked')),
  priority text default 'medium' check (priority in ('high','medium','low')),
  executed_at timestamptz,
  defects integer default 0,
  notes text,
  created_at timestamptz default now()
);

alter table test_scripts enable row level security;
create policy "auth users can manage test_scripts"
  on test_scripts for all to authenticated
  using (true) with check (true);

-- ─── test_defects ─────────────────────────────────────────────
create table if not exists test_defects (
  id uuid primary key default gen_random_uuid(),
  test_script_id uuid references test_scripts(id) on delete cascade,
  defect_id text,                         -- e.g. DEF-001
  title text not null,
  severity text default 'medium' check (severity in ('critical','high','medium','low')),
  status text default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to uuid references users(id),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

alter table test_defects enable row level security;
create policy "auth users can manage test_defects"
  on test_defects for all to authenticated
  using (true) with check (true);
