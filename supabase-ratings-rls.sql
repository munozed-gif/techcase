-- ============================================================
-- TechCase — Row Level Security for ratings table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Create ratings table if it doesn't exist
CREATE TABLE IF NOT EXISTS ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id       uuid REFERENCES cases(id) ON DELETE SET NULL,
  rated_by      uuid NOT NULL REFERENCES users(id),
  score         int  NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment       text,
  is_public     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (consultant_id, case_id, rated_by)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view public ratings"  ON ratings;
DROP POLICY IF EXISTS "Managers and clients can rate"   ON ratings;
DROP POLICY IF EXISTS "Raters can update own ratings"   ON ratings;
DROP POLICY IF EXISTS "Admins can delete ratings"       ON ratings;

-- Everyone authenticated can see public ratings
CREATE POLICY "Anyone can view public ratings"
  ON ratings FOR SELECT
  TO authenticated
  USING (is_public = true OR rated_by = auth.uid());

-- Managers, admins, and clients can insert ratings
CREATE POLICY "Managers and clients can rate"
  ON ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    rated_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager', 'client')
    )
  );

-- Users can update their own ratings
CREATE POLICY "Raters can update own ratings"
  ON ratings FOR UPDATE
  TO authenticated
  USING (rated_by = auth.uid());

-- Admins can delete ratings
CREATE POLICY "Admins can delete ratings"
  ON ratings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );
