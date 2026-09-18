-- Core platform schema
-- Run this on a fresh Supabase project before any other migration files.
-- All tables are inferred from the app code queries.
-- Later migration files (supabase-*.sql) layer on top of this.

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── users (mirrors auth.users) ───────────────────────────────────────────────
create table if not exists public.users (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  email               text        not null unique,
  full_name           text,
  avatar_url          text,
  role                text        not null default 'consultant'
                        check (role in ('admin','manager','consultant','client',
                                        'key_user','headhunter','final_user',
                                        'internal_consultant','project_manager')),
  phone               text,
  bio                 text,
  location            text,
  trust_level         int         check (trust_level between 0 and 100),
  verification_status text        not null default 'pending'
                        check (verification_status in ('pending','approved','rejected')),
  headhunter_id       uuid        references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_self_read"    on public.users for select using (auth.uid() = id or auth.uid() in (select id from public.users where role in ('admin','manager')));
create policy "users_self_update"  on public.users for update using (auth.uid() = id);
create policy "users_admin_all"    on public.users for all using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- Trigger: keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- ── consultant_profiles ───────────────────────────────────────────────────────
create table if not exists public.consultant_profiles (
  id                    uuid        primary key references public.users(id) on delete cascade,
  headline              text,
  bio                   text,
  skills                text[],
  sap_modules           text[],
  industries            text[],
  hourly_rate           numeric(10,2),
  daily_rate            numeric(10,2),
  years_experience      int,
  availability_pct      int         check (availability_pct between 0 and 100),
  available_from        date,
  external_occupancy_pct int        check (external_occupancy_pct between 0 and 100),
  travel_available      boolean     default false,
  work_mode             text,
  linkedin_url          text,
  github_url            text,
  portfolio_url         text,
  certifications        jsonb       default '[]',
  education             jsonb       default '[]',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.consultant_profiles enable row level security;
create policy "cp_read_authenticated"  on public.consultant_profiles for select using (auth.uid() is not null);
create policy "cp_self_write"          on public.consultant_profiles for all   using (auth.uid() = id);

create trigger consultant_profiles_updated_at before update on public.consultant_profiles
  for each row execute function public.set_updated_at();

-- ── client_profiles ───────────────────────────────────────────────────────────
create table if not exists public.client_profiles (
  id           uuid        primary key references public.users(id) on delete cascade,
  company_name text,
  industry     text,
  website      text,
  logo_url     text,
  address      text,
  vat_number   text,
  billing_plan text        default 'starter',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.client_profiles enable row level security;
create policy "clp_read_auth"   on public.client_profiles for select using (auth.uid() is not null);
create policy "clp_self_write"  on public.client_profiles for all   using (auth.uid() = id);

create trigger client_profiles_updated_at before update on public.client_profiles
  for each row execute function public.set_updated_at();

-- ── client_team_members ───────────────────────────────────────────────────────
create table if not exists public.client_team_members (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.users(id) on delete cascade,
  email       text        not null,
  name        text,
  role        text        not null check (role in ('key_user','final_user','internal_consultant','project_manager')),
  status      text        not null default 'invited' check (status in ('invited','active','inactive')),
  created_at  timestamptz not null default now()
);

alter table public.client_team_members enable row level security;
create policy "ctm_client_manage" on public.client_team_members for all
  using (auth.uid() = client_id or exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── projects ──────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        references public.users(id) on delete set null,
  name        text        not null,
  description text,
  avatar_url  text,
  status      text        not null default 'active',
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.projects enable row level security;
create policy "projects_read_auth" on public.projects for select using (auth.uid() is not null);
create policy "projects_write_staff" on public.projects for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','client')));

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ── cases ─────────────────────────────────────────────────────────────────────
create table if not exists public.cases (
  id                uuid        primary key default gen_random_uuid(),
  case_ref          text,
  title             text        not null,
  description       text,
  status            text        not null default 'open',
  priority          text        default 'medium',
  client_id         uuid        references public.users(id) on delete set null,
  manager_id        uuid        references public.users(id) on delete set null,
  project_id        uuid        references public.projects(id) on delete set null,
  parent_case_id    uuid        references public.cases(id) on delete set null,
  budget            numeric(12,2),
  estimated_hours   numeric(8,2),
  start_date        date,
  due_date          date,
  completed_at      timestamptz,
  progress_pct      int         not null default 0 check (progress_pct between 0 and 100),
  skills_required   text[],
  sap_modules       text[],
  work_mode         text,
  case_type         text,
  is_head_hunter    boolean     not null default false,
  head_hunter_id    uuid        references public.users(id) on delete set null,
  lifecycle_stage   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists cases_client_id   on public.cases(client_id);
create index if not exists cases_status      on public.cases(status);
create index if not exists cases_project_id  on public.cases(project_id);
create index if not exists cases_created_at  on public.cases(created_at desc);

alter table public.cases enable row level security;
create policy "cases_read_auth"   on public.cases for select using (auth.uid() is not null);
create policy "cases_write_staff" on public.cases for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','client','headhunter')));

create trigger cases_updated_at before update on public.cases
  for each row execute function public.set_updated_at();

-- ── case_assignments ──────────────────────────────────────────────────────────
create table if not exists public.case_assignments (
  id              uuid        primary key default gen_random_uuid(),
  case_id         uuid        not null references public.cases(id) on delete cascade,
  consultant_id   uuid        not null references public.users(id) on delete cascade,
  time_commitment text,
  assigned_at     timestamptz not null default now(),
  unique (case_id, consultant_id)
);

alter table public.case_assignments enable row level security;
create policy "ca_read_auth"    on public.case_assignments for select using (auth.uid() is not null);
create policy "ca_write_staff"  on public.case_assignments for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── case_key_users ────────────────────────────────────────────────────────────
create table if not exists public.case_key_users (
  id          uuid        primary key default gen_random_uuid(),
  case_id     uuid        not null references public.cases(id) on delete cascade,
  user_id     uuid        not null references public.users(id) on delete cascade,
  area        text,
  created_at  timestamptz not null default now(),
  unique (case_id, user_id)
);

alter table public.case_key_users enable row level security;
create policy "cku_read_auth" on public.case_key_users for select using (auth.uid() is not null);
create policy "cku_write_staff" on public.case_key_users for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','client')));

-- ── applications ──────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id                            uuid        primary key default gen_random_uuid(),
  case_id                       uuid        not null references public.cases(id) on delete cascade,
  consultant_id                 uuid        not null references public.users(id) on delete cascade,
  team_id                       uuid,
  status                        text        not null default 'pending'
                                  check (status in ('pending','accepted','rejected','withdrawn')),
  cover_letter                  text,
  proposed_rate                 numeric(10,2),
  time_commitment               text,
  notes                         text,
  submitted_at                  timestamptz not null default now(),
  reviewed_at                   timestamptz,
  reviewed_by                   uuid        references public.users(id) on delete set null,
  headhunter_commission_paid    boolean     not null default false,
  headhunter_commission_paid_at timestamptz,
  headhunter_commission_amount  numeric(10,2),
  unique (case_id, consultant_id)
);

create index if not exists applications_case_id       on public.applications(case_id);
create index if not exists applications_consultant_id on public.applications(consultant_id);

alter table public.applications enable row level security;
create policy "app_read_staff" on public.applications for select
  using (auth.uid() is not null);
create policy "app_insert_self" on public.applications for insert
  with check (consultant_id = auth.uid());
create policy "app_update_staff" on public.applications for update
  using (consultant_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── case_comments ──────────────────────────────────────────────────────────────
create table if not exists public.case_comments (
  id              uuid        primary key default gen_random_uuid(),
  case_id         uuid        not null references public.cases(id) on delete cascade,
  author_id       uuid        not null references public.users(id) on delete cascade,
  body            text        not null,
  hours_logged    numeric(6,2) not null default 0,
  progress_update int,
  is_internal     boolean     not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists case_comments_case_id on public.case_comments(case_id);

alter table public.case_comments enable row level security;
create policy "cc_read_auth"   on public.case_comments for select using (auth.uid() is not null);
create policy "cc_insert_auth" on public.case_comments for insert with check (author_id = auth.uid());

-- ── case_milestones ───────────────────────────────────────────────────────────
create table if not exists public.case_milestones (
  id          uuid        primary key default gen_random_uuid(),
  case_id     uuid        not null references public.cases(id) on delete cascade,
  title       text        not null,
  is_done     boolean     not null default false,
  done_at     timestamptz,
  position    int         not null default 1,
  created_at  timestamptz not null default now()
);

alter table public.case_milestones enable row level security;
create policy "cm_read_auth"   on public.case_milestones for select using (auth.uid() is not null);
create policy "cm_write_staff" on public.case_milestones for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','consultant')));

-- ── case_activities ───────────────────────────────────────────────────────────
create table if not exists public.case_activities (
  id                    uuid        primary key default gen_random_uuid(),
  case_id               uuid        not null references public.cases(id) on delete cascade,
  task_no               int         not null default 1,
  sort_order            int         not null default 1,
  title                 text        not null,
  description           text,
  activity_type         text        default 'task',
  status                text        default 'pending',
  progress_pct          int         not null default 0,
  est_hours             numeric(8,2),
  phase                 text,
  start_date_plan       date,
  end_date_plan         date,
  start_date_actual     date,
  end_date_actual       date,
  assigned_to           uuid        references public.users(id) on delete set null,
  linked_case_id        uuid        references public.cases(id) on delete set null,
  predecessors          int[],
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists ca_case_id on public.case_activities(case_id);

alter table public.case_activities enable row level security;
create policy "cact_read_auth"   on public.case_activities for select using (auth.uid() is not null);
create policy "cact_write_staff" on public.case_activities for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','consultant')));

create trigger case_activities_updated_at before update on public.case_activities
  for each row execute function public.set_updated_at();

-- ── hh_proposals ──────────────────────────────────────────────────────────────
create table if not exists public.hh_proposals (
  id            uuid        primary key default gen_random_uuid(),
  case_id       uuid        not null references public.cases(id) on delete cascade,
  headhunter_id uuid        not null references public.users(id) on delete cascade,
  status        text        not null default 'pending'
                  check (status in ('pending','accepted','rejected','withdrawn')),
  notes         text,
  commission_pct numeric(5,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (case_id, headhunter_id)
);

alter table public.hh_proposals enable row level security;
create policy "hhp_read_staff" on public.hh_proposals for select
  using (headhunter_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','client')));
create policy "hhp_hh_write" on public.hh_proposals for all
  using (headhunter_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── invoices ──────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id             uuid        primary key default gen_random_uuid(),
  invoice_number text,
  client_id      uuid        references public.users(id) on delete set null,
  consultant_id  uuid        references public.users(id) on delete set null,
  case_id        uuid        references public.cases(id) on delete set null,
  amount         numeric(12,2) not null default 0,
  status         text        not null default 'draft'
                   check (status in ('draft','sent','paid','overdue')),
  due_date       date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists invoices_client_id on public.invoices(client_id);

alter table public.invoices enable row level security;
create policy "inv_read_staff" on public.invoices for select
  using (client_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));
create policy "inv_write_staff" on public.invoices for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

-- ── time_entries ──────────────────────────────────────────────────────────────
create table if not exists public.time_entries (
  id            uuid        primary key default gen_random_uuid(),
  case_id       uuid        not null references public.cases(id) on delete cascade,
  consultant_id uuid        not null references public.users(id) on delete cascade,
  date          date        not null,
  hours         numeric(6,2) not null,
  description   text,
  is_approved   boolean     not null default false,
  approved_by   uuid        references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists te_case_id       on public.time_entries(case_id);
create index if not exists te_consultant_id on public.time_entries(consultant_id);

alter table public.time_entries enable row level security;
create policy "te_read_auth" on public.time_entries for select using (auth.uid() is not null);
create policy "te_insert_self" on public.time_entries for insert with check (consultant_id = auth.uid());
create policy "te_update_staff" on public.time_entries for update
  using (consultant_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── case_documents (public bucket) ───────────────────────────────────────────
create table if not exists public.case_documents (
  id           uuid        primary key default gen_random_uuid(),
  case_id      uuid        not null references public.cases(id) on delete cascade,
  uploaded_by  uuid        references public.users(id) on delete set null,
  file_name    text        not null,
  file_url     text        not null,
  file_type    text,
  file_size_kb int,
  category     text,
  doc_type     text,
  name         text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists cdoc_case_id on public.case_documents(case_id);

alter table public.case_documents enable row level security;
create policy "cdoc_read_auth"   on public.case_documents for select using (auth.uid() is not null);
create policy "cdoc_insert_auth" on public.case_documents for insert with check (auth.uid() is not null);
create policy "cdoc_delete_own"  on public.case_documents for delete using (uploaded_by = auth.uid() or
  exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── case_files (signed-URL bucket) ───────────────────────────────────────────
create table if not exists public.case_files (
  id          uuid        primary key default gen_random_uuid(),
  case_id     uuid        not null references public.cases(id) on delete cascade,
  user_id     uuid        references public.users(id) on delete set null,
  file_name   text        not null,
  name        text,
  file_path   text        not null,
  file_size   bigint,
  mime_type   text,
  created_at  timestamptz not null default now()
);

create index if not exists cf_case_id on public.case_files(case_id);

alter table public.case_files enable row level security;
create policy "cf_read_auth"   on public.case_files for select using (auth.uid() is not null);
create policy "cf_insert_auth" on public.case_files for insert with check (auth.uid() is not null);
create policy "cf_delete_own"  on public.case_files for delete using (user_id = auth.uid() or
  exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── sla_configs ───────────────────────────────────────────────────────────────
create table if not exists public.sla_configs (
  id                   uuid        primary key default gen_random_uuid(),
  client_id            uuid        not null unique references public.users(id) on delete cascade,
  response_hours       int         default 24,
  resolution_hours     int         default 72,
  escalation_hours     int         default 48,
  priority_multipliers jsonb       default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.sla_configs enable row level security;
create policy "sla_read_auth"   on public.sla_configs for select using (auth.uid() is not null);
create policy "sla_write_staff" on public.sla_configs for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager','client')));

-- ── db_connections ────────────────────────────────────────────────────────────
create table if not exists public.db_connections (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        references public.users(id) on delete cascade,
  project_id   uuid        references public.projects(id) on delete cascade,
  name         text        not null,
  type         text,
  host         text,
  port         int,
  database     text,
  credentials  jsonb,
  created_at   timestamptz not null default now()
);

alter table public.db_connections enable row level security;
create policy "dbc_read_staff" on public.db_connections for select
  using (client_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));
create policy "dbc_write_staff" on public.db_connections for all
  using (client_id = auth.uid() or
         exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── consultant_teams ──────────────────────────────────────────────────────────
create table if not exists public.consultant_teams (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  created_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.consultant_team_members (
  id         uuid        primary key default gen_random_uuid(),
  team_id    uuid        not null references public.consultant_teams(id) on delete cascade,
  user_id    uuid        references public.users(id) on delete cascade,
  email      text,
  role       text        default 'member',
  status     text        default 'active',
  created_at timestamptz not null default now()
);

alter table public.consultant_teams         enable row level security;
alter table public.consultant_team_members  enable row level security;
create policy "ct_read_auth"  on public.consultant_teams        for select using (auth.uid() is not null);
create policy "ctm2_read_auth" on public.consultant_team_members for select using (auth.uid() is not null);

-- ── project_templates ─────────────────────────────────────────────────────────
create table if not exists public.project_templates (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  structure   jsonb       default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.project_templates enable row level security;
create policy "pt_read_auth"   on public.project_templates for select using (auth.uid() is not null);
create policy "pt_write_staff" on public.project_templates for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── system_settings ───────────────────────────────────────────────────────────
create table if not exists public.system_settings (
  id         uuid        primary key default gen_random_uuid(),
  key        text        not null unique,
  value      jsonb       not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;
create policy "ss_read_auth"   on public.system_settings for select using (auth.uid() is not null);
create policy "ss_write_admin" on public.system_settings for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));

-- ── audit_events ──────────────────────────────────────────────────────────────
create table if not exists public.audit_events (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references public.users(id) on delete set null,
  user_email    text,
  event_type    text        not null,
  entity_type   text,
  entity_id     uuid,
  entity_name   text,
  old_value     jsonb,
  new_value     jsonb,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists ae_user_id    on public.audit_events(user_id);
create index if not exists ae_event_type on public.audit_events(event_type);
create index if not exists ae_created_at on public.audit_events(created_at desc);

alter table public.audit_events enable row level security;
create policy "ae_read_admin" on public.audit_events for select
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','manager')));
create policy "ae_insert_auth" on public.audit_events for insert with check (auth.uid() is not null);

-- ── notifications (see also supabase-notifications.sql) ───────────────────────
-- This table is created in supabase-notifications.sql; listed here for reference.
-- create table public.notifications ( ... );

-- ── case_ratings (see also supabase-case-ratings.sql) ─────────────────────────
-- This table is created in supabase-case-ratings.sql; listed here for reference.
-- create table public.case_ratings ( ... );

-- ── Storage buckets ───────────────────────────────────────────────────────────
-- Run these via the Supabase dashboard or CLI:
--   supabase storage create-bucket case-documents --public
--   supabase storage create-bucket case-files
-- The case-documents bucket is public; case-files uses signed URLs (private).
