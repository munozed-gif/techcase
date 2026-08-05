-- ============================================================
-- TechCase — Projects Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text NOT NULL,
  description  text,
  client_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES users(id),
  status       text DEFAULT 'draft'
               CHECK (status IN ('draft','active','on_hold','completed','cancelled')),
  start_date   date,
  end_date     date,
  total_budget numeric,
  area_sap     text,
  industry     text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- 2. Add project_id to cases (nullable — no impact on existing data)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS project_id uuid
  REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cases_project_id_idx ON cases(project_id);

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT USING (
  -- admin / manager see all
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin','manager')
  -- client sees own
  OR client_id = auth.uid()
  -- consultant sees projects they have a case in
  OR id IN (
    SELECT c.project_id FROM cases c
    JOIN case_assignments ca ON ca.case_id = c.id
    WHERE ca.consultant_id = auth.uid() AND c.project_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (
  (SELECT role FROM users WHERE id = auth.uid()) IN ('admin','manager','client')
);

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (
  client_id = auth.uid()
  OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin','manager')
);

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (
  (client_id = auth.uid() OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin','manager'))
  AND NOT EXISTS (SELECT 1 FROM cases WHERE project_id = projects.id)
);
