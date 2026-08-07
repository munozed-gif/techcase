-- ============================================================
-- TechCase — Lifecycle Templates (system-wide presets)
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS lifecycle_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  subtitle    text,
  description text,
  stages      jsonb NOT NULL DEFAULT '[]',
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed with the three default presets
INSERT INTO lifecycle_templates (key, name, subtitle, description, stages, sort_order)
VALUES
  ('short', 'Short', '4 stages', 'Simple flow for straightforward consulting requests.',
   '[{"key":"open","label":"New Request","color":"#10b981","is_terminal":false},{"key":"in_progress","label":"Active","color":"#3b82f6","is_terminal":false},{"key":"completed","label":"Done","color":"#6b7280","is_terminal":true},{"key":"cancelled","label":"Cancelled","color":"#ef4444","is_terminal":true}]',
   0),
  ('standard', 'Standard', '5 stages', 'Default consulting flow with an On Hold pause state.',
   '[{"key":"open","label":"Open","color":"#10b981","is_terminal":false},{"key":"in_progress","label":"In Progress","color":"#3b82f6","is_terminal":false},{"key":"on_hold","label":"On Hold","color":"#eab308","is_terminal":false},{"key":"completed","label":"Completed","color":"#6b7280","is_terminal":true},{"key":"cancelled","label":"Cancelled","color":"#ef4444","is_terminal":true}]',
   1),
  ('large', 'Large', '7 stages', 'Full consulting pipeline from sourcing through placement.',
   '[{"key":"open","label":"Sourcing","color":"#8b5cf6","is_terminal":false},{"key":"screening","label":"Screening","color":"#06b6d4","is_terminal":false},{"key":"shortlisted","label":"Shortlisted","color":"#6366f1","is_terminal":false},{"key":"in_progress","label":"In Progress","color":"#3b82f6","is_terminal":false},{"key":"on_hold","label":"Negotiation","color":"#f59e0b","is_terminal":false},{"key":"completed","label":"Placed","color":"#10b981","is_terminal":true},{"key":"cancelled","label":"Closed Lost","color":"#ef4444","is_terminal":true}]',
   2)
ON CONFLICT (key) DO NOTHING;

-- RLS: everyone reads, only admin/manager writes
ALTER TABLE lifecycle_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lifecycle_templates_read' AND tablename = 'lifecycle_templates') THEN
    CREATE POLICY "lifecycle_templates_read" ON lifecycle_templates FOR SELECT USING (true);
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lifecycle_templates_admin_write' AND tablename = 'lifecycle_templates') THEN
    CREATE POLICY "lifecycle_templates_admin_write" ON lifecycle_templates FOR ALL
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin','manager')));
  END IF;
END$$;
