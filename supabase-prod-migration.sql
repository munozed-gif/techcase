-- ============================================================
-- ArenaSolP-Prod Migration: bring Prod up to Phoenix schema
-- Generated: 2026-10-13
-- Run this in: ArenaSolP-Prod Supabase SQL Editor
-- ============================================================
-- Sections:
--   1. Enum types (new + missing values)
--   2. New tables
--   3. Missing columns on existing tables
-- ============================================================


-- ============================================================
-- SECTION 1: ENUM TYPES
-- ============================================================

-- NOTE: `audit_events` (Prod) is renamed to `audit_logs` (Phoenix name).
-- Existing rows are preserved. Missing column `user_name` is added.
-- `entity_id` is cast from uuid → text to match Phoenix.

-- application_status (entirely missing in Prod)
DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('pending','under_review','accepted','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- priority_level (entirely missing in Prod)
DO $$ BEGIN
  CREATE TYPE priority_level AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_role (entirely missing in Prod)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'admin','manager','consultant','client','key_user',
    'internal_consultant','project_manager','final_user',
    'headhunter','dispatch','area_leader','invited_client'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- work_auth_type (entirely missing in Prod)
DO $$ BEGIN
  CREATE TYPE work_auth_type AS ENUM ('citizen','permanent_resident','work_visa','contractor','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- case_status: add missing values
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'triage';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'in_analysis';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'pending_customer';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'pending_sap';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'pending_user';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'pending_vendor';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'escalated';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'reopened';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'testing';


-- ============================================================
-- SECTION 2: NEW TABLES
-- ============================================================

-- ai_usage: tracks monthly AI generation counts per user (free tier)
CREATE TABLE IF NOT EXISTS ai_usage (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month             character(7) NOT NULL,
  generations_used  integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, month)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ai_usage" ON ai_usage
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access ai_usage" ON ai_usage
  FOR ALL USING (auth.role() = 'service_role');

-- audit_logs: rename audit_events → audit_logs, patch schema to match Phoenix
ALTER TABLE IF EXISTS audit_events RENAME TO audit_logs;

-- Add missing column
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name text;

-- Cast entity_id from uuid → text to match Phoenix (preserves existing data)
ALTER TABLE audit_logs ALTER COLUMN entity_id TYPE text USING entity_id::text;

-- Ensure RLS policies exist (drop old ones by name first to avoid conflicts)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit_events" ON audit_logs;
DROP POLICY IF EXISTS "Service role full access audit_events" ON audit_logs;
DROP POLICY IF EXISTS "Admins read audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Service role full access audit_logs" ON audit_logs;
CREATE POLICY "Admins read audit_logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );
CREATE POLICY "Service role full access audit_logs" ON audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- approval_requests: external reviewer approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token               uuid NOT NULL DEFAULT gen_random_uuid(),
  reviewer_email      text NOT NULL,
  reviewer_user_id    uuid,
  case_id             uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  project_id          uuid,
  status              text NOT NULL DEFAULT 'pending',
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  expires_at          timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval),
  reviewer_name       text,
  reviewer_avatar_url text,
  UNIQUE(token)
);
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage approval_requests" ON approval_requests
  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Anon read by token" ON approval_requests
  FOR SELECT USING (true);

-- approval_request_objects: items within an approval request
CREATE TABLE IF NOT EXISTS approval_request_objects (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  object_id           text NOT NULL,
  object_name         text,
  object_type         text,
  object_description  text,
  object_phase        text,
  decision            text,
  rejection_reason    text,
  decided_at          timestamp with time zone
);
ALTER TABLE approval_request_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage approval_objects" ON approval_request_objects
  FOR ALL USING (auth.uid() IS NOT NULL);

-- case_invitations: email invitations to join a case
CREATE TABLE IF NOT EXISTS case_invitations (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  invited_email  text NOT NULL,
  invited_name   text,
  invited_by     uuid,
  token          uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status         text NOT NULL DEFAULT 'pending',
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  expires_at     timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval)
);
ALTER TABLE case_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage case_invitations" ON case_invitations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- spec_review_tokens: customer-facing spec review links
CREATE TABLE IF NOT EXISTS spec_review_tokens (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token          text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  created_by     uuid,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  expires_at     timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval),
  status         text NOT NULL DEFAULT 'pending',
  customer_name  text,
  customer_email text,
  approved_at    timestamp with time zone,
  feedback       text,
  doc_ids        jsonb DEFAULT '{}'::jsonb,
  case_title     text
);
ALTER TABLE spec_review_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage spec_review_tokens" ON spec_review_tokens
  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Anon read non-expired tokens" ON spec_review_tokens
  FOR SELECT USING (expires_at > now());
CREATE POLICY "Anon update token status" ON spec_review_tokens
  FOR UPDATE USING (expires_at > now() AND status = 'pending')
  WITH CHECK (status IN ('approved','changes_requested'));

-- entities: organizations / companies
CREATE TABLE IF NOT EXISTS entities (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  logo_url   text,
  industry   text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read entities" ON entities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage entities" ON entities FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))
);

-- entity_members: users belonging to an entity
CREATE TABLE IF NOT EXISTS entity_members (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  joined_at  timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(entity_id, user_id)
);
ALTER TABLE entity_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read entity_members" ON entity_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage entity_members" ON entity_members FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))
);

-- favorites: consultants bookmarking cases
CREATE TABLE IF NOT EXISTS favorites (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultant_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(consultant_id, case_id)
);
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consultants manage own favorites" ON favorites
  FOR ALL USING (auth.uid() = consultant_id);

-- followed_clients: consultants following client profiles
CREATE TABLE IF NOT EXISTS followed_clients (
  consultant_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (consultant_id, client_user_id)
);
ALTER TABLE followed_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consultants manage own followed_clients" ON followed_clients
  FOR ALL USING (auth.uid() = consultant_id);

-- rating_dimensions: configurable rating criteria
CREATE TABLE IF NOT EXISTS rating_dimensions (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key         text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  weight      numeric DEFAULT 1.0,
  active      boolean DEFAULT true,
  sort_order  integer DEFAULT 0,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE rating_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read rating_dimensions" ON rating_dimensions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage rating_dimensions" ON rating_dimensions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))
);

-- user_vouches: peer endorsements
CREATE TABLE IF NOT EXISTS user_vouches (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vouchee_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note        text,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(voucher_id, vouchee_id)
);
ALTER TABLE user_vouches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read user_vouches" ON user_vouches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users manage own vouches" ON user_vouches FOR ALL USING (auth.uid() = voucher_id);

-- time_logs: simple hour logging per case
CREATE TABLE IF NOT EXISTS time_logs (
  id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hours       numeric NOT NULL,
  description text,
  log_date    date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage time_logs" ON time_logs
  FOR ALL USING (auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- sla_profiles: named SLA tiers
CREATE TABLE IF NOT EXISTS sla_profiles (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 text NOT NULL,
  priority_level       integer,
  description          text,
  first_response_hours numeric NOT NULL,
  resolution_hours     numeric NOT NULL,
  applies_to_roles     text[] DEFAULT '{all}'::text[],
  color                text DEFAULT '#6366f1',
  is_active            boolean DEFAULT true,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE sla_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read sla_profiles" ON sla_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage sla_profiles" ON sla_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager'))
);

-- sla_tracking: per-case SLA tracking
CREATE TABLE IF NOT EXISTS sla_tracking (
  id                      uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id                 uuid REFERENCES cases(id) ON DELETE CASCADE,
  profile_id              uuid REFERENCES sla_profiles(id),
  assigned_at             timestamp with time zone DEFAULT now(),
  first_response_at       timestamp with time zone,
  resolved_at             timestamp with time zone,
  first_response_breached boolean DEFAULT false,
  resolution_breached     boolean DEFAULT false,
  breach_notified_at      timestamp with time zone
);
ALTER TABLE sla_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage sla_tracking" ON sla_tracking
  FOR ALL USING (auth.uid() IS NOT NULL);

-- migration_projects: SAP migration project tracking
CREATE TABLE IF NOT EXISTS migration_projects (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  approach       text DEFAULT 'brownfield',
  source_version text,
  target_version text DEFAULT 'SAP S/4HANA 2023',
  go_live_date   date,
  current_phase  text DEFAULT 'discover',
  created_by     uuid,
  created_at     timestamp with time zone DEFAULT now()
);
ALTER TABLE migration_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage migration_projects" ON migration_projects
  FOR ALL USING (auth.uid() IS NOT NULL);

-- migration_phase_deliverables
CREATE TABLE IF NOT EXISTS migration_phase_deliverables (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  phase                text NOT NULL,
  title                text NOT NULL,
  completed            boolean DEFAULT false,
  completed_by         uuid,
  completed_at         timestamp with time zone,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE migration_phase_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage migration_phase_deliverables" ON migration_phase_deliverables
  FOR ALL USING (auth.uid() IS NOT NULL);

-- migration_phase_gates
CREATE TABLE IF NOT EXISTS migration_phase_gates (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  phase                text NOT NULL,
  status               text DEFAULT 'not_started',
  approved_by          uuid,
  approved_at          timestamp with time zone,
  notes                text
);
ALTER TABLE migration_phase_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage migration_phase_gates" ON migration_phase_gates
  FOR ALL USING (auth.uid() IS NOT NULL);

-- data_migration_objects
CREATE TABLE IF NOT EXISTS data_migration_objects (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  sap_object           text,
  category             text,
  record_count_source  integer,
  owner_id             uuid,
  mapping_status       text DEFAULT 'not_started',
  quality_issues       integer DEFAULT 0,
  mock_run_1_pct       numeric,
  mock_run_1_errors    integer,
  mock_run_2_pct       numeric,
  mock_run_2_errors    integer,
  go_live_pct          numeric,
  go_live_errors       integer,
  go_no_go             boolean DEFAULT false,
  notes                text,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE data_migration_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage data_migration_objects" ON data_migration_objects
  FOR ALL USING (auth.uid() IS NOT NULL);

-- data_quality_issues
CREATE TABLE IF NOT EXISTS data_quality_issues (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_object_id uuid REFERENCES data_migration_objects(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  severity       text DEFAULT 'medium',
  status         text DEFAULT 'open',
  owner_id       uuid,
  resolved_at    timestamp with time zone,
  created_at     timestamp with time zone DEFAULT now()
);
ALTER TABLE data_quality_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage data_quality_issues" ON data_quality_issues
  FOR ALL USING (auth.uid() IS NOT NULL);

-- simplification_items
CREATE TABLE IF NOT EXISTS simplification_items (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  item_id              text,
  title                text NOT NULL,
  area                 text DEFAULT 'Other',
  impact               text DEFAULT 'informational',
  description          text,
  affected_objects     text,
  remediation_notes    text,
  status               text DEFAULT 'open',
  owner_id             uuid,
  resolved_at          timestamp with time zone,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE simplification_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage simplification_items" ON simplification_items
  FOR ALL USING (auth.uid() IS NOT NULL);

-- wricef_objects
CREATE TABLE IF NOT EXISTS wricef_objects (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  name                 text NOT NULL,
  object_id            text,
  description          text,
  complexity           text DEFAULT 'medium',
  effort_days          numeric,
  owner_id             uuid,
  remediation_approach text,
  status               text DEFAULT 'open',
  signed_off_by        uuid,
  signed_off_at        timestamp with time zone,
  created_at           timestamp with time zone DEFAULT now(),
  blueprint            jsonb
);
ALTER TABLE wricef_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage wricef_objects" ON wricef_objects
  FOR ALL USING (auth.uid() IS NOT NULL);

-- fitgap_items
CREATE TABLE IF NOT EXISTS fitgap_items (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  item_number          text,
  process_area         text,
  description          text NOT NULL,
  gap_type             text DEFAULT 'gap',
  priority             text DEFAULT 'medium',
  resolution           text,
  wricef_id            uuid REFERENCES wricef_objects(id) ON DELETE SET NULL,
  owner_id             uuid,
  status               text DEFAULT 'open',
  notes                text,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE fitgap_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage fitgap_items" ON fitgap_items
  FOR ALL USING (auth.uid() IS NOT NULL);

-- transport_requests
CREATE TABLE IF NOT EXISTS transport_requests (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  tr_number            text NOT NULL,
  description          text,
  category             text,
  owner_id             uuid,
  status               text DEFAULT 'dev',
  released_at          timestamp with time zone,
  qa_imported_at       timestamp with time zone,
  prod_imported_at     timestamp with time zone,
  rejected_reason      text,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE transport_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage transport_requests" ON transport_requests
  FOR ALL USING (auth.uid() IS NOT NULL);

-- cutover_runs
CREATE TABLE IF NOT EXISTS cutover_runs (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  run_type             text NOT NULL,
  scheduled_date       timestamp with time zone,
  system_freeze_date   timestamp with time zone,
  downtime_start       timestamp with time zone,
  downtime_end         timestamp with time zone,
  status               text DEFAULT 'planned',
  go_no_go             text,
  go_no_go_by          uuid,
  go_no_go_at          timestamp with time zone,
  notes                text
);
ALTER TABLE cutover_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage cutover_runs" ON cutover_runs
  FOR ALL USING (auth.uid() IS NOT NULL);

-- cutover_tasks
CREATE TABLE IF NOT EXISTS cutover_tasks (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  seq                  integer NOT NULL,
  title                text NOT NULL,
  team                 text,
  owner_id             uuid,
  duration_hours       numeric,
  depends_on           integer,
  run_type             text DEFAULT 'all',
  status               text DEFAULT 'pending',
  started_at           timestamp with time zone,
  completed_at         timestamp with time zone,
  notes                text,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE cutover_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage cutover_tasks" ON cutover_tasks
  FOR ALL USING (auth.uid() IS NOT NULL);

-- test_scripts
CREATE TABLE IF NOT EXISTS test_scripts (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_project_id uuid REFERENCES migration_projects(id) ON DELETE CASCADE,
  script_id            text,
  title                text NOT NULL,
  process_area         text,
  test_type            text DEFAULT 'integration',
  assigned_to          uuid,
  status               text DEFAULT 'not_started',
  priority             text DEFAULT 'medium',
  executed_at          timestamp with time zone,
  defects              integer DEFAULT 0,
  notes                text,
  created_at           timestamp with time zone DEFAULT now()
);
ALTER TABLE test_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage test_scripts" ON test_scripts
  FOR ALL USING (auth.uid() IS NOT NULL);

-- test_defects
CREATE TABLE IF NOT EXISTS test_defects (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_script_id   uuid REFERENCES test_scripts(id) ON DELETE CASCADE,
  defect_id        text,
  title            text NOT NULL,
  severity         text DEFAULT 'medium',
  status           text DEFAULT 'open',
  assigned_to      uuid,
  resolution_notes text,
  resolved_at      timestamp with time zone,
  created_at       timestamp with time zone DEFAULT now()
);
ALTER TABLE test_defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage test_defects" ON test_defects
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ============================================================
-- SECTION 3: MISSING COLUMNS ON EXISTING TABLES
-- ============================================================

-- applications
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS application_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS avail_type text DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS start_date date;

-- case_activities
ALTER TABLE case_activities
  ADD COLUMN IF NOT EXISTS adjustment_notes text,
  ADD COLUMN IF NOT EXISTS coverage_pct integer,
  ADD COLUMN IF NOT EXISTS detail text,
  ADD COLUMN IF NOT EXISTS predecessor_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS test_outcome text;

-- case_assignments
ALTER TABLE case_assignments
  ADD COLUMN IF NOT EXISTS unassigned_at timestamp with time zone;

-- case_comments
ALTER TABLE case_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- cases
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS application_mode text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS area_industry text,
  ADD COLUMN IF NOT EXISTS area_sap text,
  ADD COLUMN IF NOT EXISTS currency character(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_consultants integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS migration_ref jsonb,
  ADD COLUMN IF NOT EXISTS min_trust_level text,
  ADD COLUMN IF NOT EXISTS reviewer_email text,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS reviewer_user_id uuid,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS time_commitment integer DEFAULT 0;

-- client_profiles
ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS activity_phases jsonb,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS budget text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS founded_year integer,
  ADD COLUMN IF NOT EXISTS hq_location text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS preferred_categories text[];

-- client_team_members
ALTER TABLE client_team_members
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS role_type text DEFAULT 'end-user',
  ADD COLUMN IF NOT EXISTS system_profile text,
  ADD COLUMN IF NOT EXISTS system_role text,
  ADD COLUMN IF NOT EXISTS title text;

-- consultant_customers
ALTER TABLE consultant_customers
  ADD COLUMN IF NOT EXISTS is_reference boolean DEFAULT false;

-- consultant_profiles
ALTER TABLE consultant_profiles
  ADD COLUMN IF NOT EXISTS availability_type text DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS current_location text,
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expertise_level text DEFAULT 'Mid-Level',
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS resume_url text;

-- consultant_projects
ALTER TABLE consultant_projects
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS start_date date;

-- consultant_team_members
ALTER TABLE consultant_team_members
  ADD COLUMN IF NOT EXISTS invited_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responded_at timestamp with time zone;

-- consultant_teams
ALTER TABLE consultant_teams
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- db_connections
ALTER TABLE db_connections
  ADD COLUMN IF NOT EXISTS conn_kind text,
  ADD COLUMN IF NOT EXISTS env text DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}';

-- hh_proposals
ALTER TABLE hh_proposals
  ADD COLUMN IF NOT EXISTS candidate_count_estimate integer,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS proposed_commission_pct numeric,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone NOT NULL DEFAULT now();

-- invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS issued_by uuid;

-- notifications
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general';

-- project_templates
ALTER TABLE project_templates
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Custom',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]';

-- projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS area_sap text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS project_type text DEFAULT 'consulting',
  ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS total_budget numeric;

-- sla_configs
ALTER TABLE sla_configs
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS escalation_contact text,
  ADD COLUMN IF NOT EXISTS p1_label text DEFAULT 'P1 – Critical',
  ADD COLUMN IF NOT EXISTS p1_resolution_hours integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS p1_response_hours integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS p2_label text DEFAULT 'P2 – High',
  ADD COLUMN IF NOT EXISTS p2_resolution_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS p2_response_hours integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS p3_label text DEFAULT 'P3 – Medium',
  ADD COLUMN IF NOT EXISTS p3_resolution_hours integer DEFAULT 72,
  ADD COLUMN IF NOT EXISTS p3_response_hours integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS p4_label text DEFAULT 'P4 – Low',
  ADD COLUMN IF NOT EXISTS p4_resolution_hours integer DEFAULT 168,
  ADD COLUMN IF NOT EXISTS p4_response_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS penalty_clause text;

-- time_entries
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT true;

-- users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS anthropic_api_key_enc text,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS avg_rating numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_cases_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS language_pref text,
  ADD COLUMN IF NOT EXISTS profile_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

-- work_authorizations
ALTER TABLE work_authorizations
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- DONE
-- Run in ArenaSolP-Prod SQL Editor.
-- After running: verify with SELECT count(*) FROM <each new table>;
-- ============================================================
