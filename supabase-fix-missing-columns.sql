-- ============================================================
-- TechCase — Fix missing columns (run if tables already existed)
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- sla_configs: add any columns that may be missing
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS tier                  text          NOT NULL DEFAULT 'standard';
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS response_time_hours   integer       NOT NULL DEFAULT 24;
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS resolution_time_hours integer       NOT NULL DEFAULT 72;
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS uptime_guarantee_pct  numeric(5,2)  NOT NULL DEFAULT 99;
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS dedicated_consultant  boolean       NOT NULL DEFAULT false;
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS priority_support      boolean       NOT NULL DEFAULT false;
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS notes                 text;
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS created_at            timestamptz   NOT NULL DEFAULT now();
ALTER TABLE sla_configs ADD COLUMN IF NOT EXISTS updated_at            timestamptz   NOT NULL DEFAULT now();

-- Add CHECK constraint for tier if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sla_configs_tier_check'
  ) THEN
    ALTER TABLE sla_configs ADD CONSTRAINT sla_configs_tier_check
      CHECK (tier IN ('standard','premium','enterprise'));
  END IF;
END$$;

-- Ensure UNIQUE constraint on client_id exists (needed for upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sla_configs_client_id_key'
  ) THEN
    ALTER TABLE sla_configs ADD CONSTRAINT sla_configs_client_id_key UNIQUE (client_id);
  END IF;
END$$;

-- db_connections: add any columns that may be missing
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS db_type    text      NOT NULL DEFAULT 'postgresql';
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS host       text      NOT NULL DEFAULT '';
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS port       integer   NOT NULL DEFAULT 5432;
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS db_name    text      NOT NULL DEFAULT '';
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS username   text;
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS notes      text;
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- client_team_members: add any columns that may be missing
ALTER TABLE client_team_members ADD COLUMN IF NOT EXISTS full_name   text    NOT NULL DEFAULT '';
ALTER TABLE client_team_members ADD COLUMN IF NOT EXISTS email       text;
ALTER TABLE client_team_members ADD COLUMN IF NOT EXISTS role_title  text;
ALTER TABLE client_team_members ADD COLUMN IF NOT EXISTS phone       text;
ALTER TABLE client_team_members ADD COLUMN IF NOT EXISTS is_primary  boolean NOT NULL DEFAULT false;
ALTER TABLE client_team_members ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

-- Ensure RLS is enabled on all three tables
ALTER TABLE sla_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_team_members ENABLE ROW LEVEL SECURITY;

-- Re-create policies (IF NOT EXISTS guard)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_own_sla' AND tablename = 'sla_configs') THEN
    CREATE POLICY "client_own_sla" ON sla_configs FOR ALL USING (client_id = auth.uid());
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_own_connections' AND tablename = 'db_connections') THEN
    CREATE POLICY "client_own_connections" ON db_connections FOR ALL USING (client_id = auth.uid());
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_own_team' AND tablename = 'client_team_members') THEN
    CREATE POLICY "client_own_team" ON client_team_members FOR ALL USING (client_id = auth.uid());
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'staff_read_sla' AND tablename = 'sla_configs') THEN
    CREATE POLICY "staff_read_sla" ON sla_configs FOR SELECT
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'staff_read_connections' AND tablename = 'db_connections') THEN
    CREATE POLICY "staff_read_connections" ON db_connections FOR SELECT
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'staff_read_team' AND tablename = 'client_team_members') THEN
    CREATE POLICY "staff_read_team" ON client_team_members FOR SELECT
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));
  END IF;
END$$;
