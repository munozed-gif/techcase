-- ============================================================
-- TechCase — Client Profile Supporting Tables
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. SLA Configs
CREATE TABLE IF NOT EXISTS sla_configs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                  text NOT NULL DEFAULT 'standard'
                          CHECK (tier IN ('standard','premium','enterprise')),
  response_time_hours   integer NOT NULL DEFAULT 24,
  resolution_time_hours integer NOT NULL DEFAULT 72,
  uptime_guarantee_pct  numeric(5,2) NOT NULL DEFAULT 99,
  dedicated_consultant  boolean NOT NULL DEFAULT false,
  priority_support      boolean NOT NULL DEFAULT false,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

-- 2. DB Connections
CREATE TABLE IF NOT EXISTS db_connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  db_type     text NOT NULL DEFAULT 'postgresql'
                CHECK (db_type IN ('postgresql','mysql','mssql','oracle','mongodb','other')),
  host        text NOT NULL,
  port        integer NOT NULL DEFAULT 5432,
  db_name     text NOT NULL,
  username    text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Client Team Members
CREATE TABLE IF NOT EXISTS client_team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  email       text,
  role_title  text,
  phone       text,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE sla_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_own_sla"
  ON sla_configs FOR ALL USING (client_id = auth.uid());

CREATE POLICY "client_own_connections"
  ON db_connections FOR ALL USING (client_id = auth.uid());

CREATE POLICY "client_own_team"
  ON client_team_members FOR ALL USING (client_id = auth.uid());

CREATE POLICY "staff_read_sla"
  ON sla_configs FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));

CREATE POLICY "staff_read_connections"
  ON db_connections FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));

CREATE POLICY "staff_read_team"
  ON client_team_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));
