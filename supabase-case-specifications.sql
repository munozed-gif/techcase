-- ============================================================
-- TechCase — Functional Specification table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS case_specifications (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  mode           text        NOT NULL CHECK (mode IN ('manual', 'wizard', 'ai')),
  status         text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  title          text,
  objects        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  content        text,
  notes          text,
  document_ids   uuid[]      NOT NULL DEFAULT ARRAY[]::uuid[],
  created_by     uuid        REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  approved_by    uuid        REFERENCES users(id),
  approved_at    timestamptz,
  rejected_reason text
);

CREATE INDEX IF NOT EXISTS case_specifications_case_id_idx ON case_specifications(case_id);

-- Enable RLS and allow authenticated users full access
ALTER TABLE case_specifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage specs" ON case_specifications;
CREATE POLICY "Authenticated users can manage specs"
  ON case_specifications
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
