-- ============================================================
-- TechCase — Row Level Security for applications table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Consultants can view their own applications
CREATE POLICY "Consultants can view own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (consultant_id = auth.uid());

-- Managers and admins can view all applications
CREATE POLICY "Managers can view all applications"
  ON applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Consultants can insert their own applications
CREATE POLICY "Consultants can apply to cases"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (consultant_id = auth.uid());

-- Managers and admins can insert applications
CREATE POLICY "Managers can insert applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Managers and admins can update applications (review, accept, reject)
CREATE POLICY "Managers can update applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Consultants can withdraw (delete) their own applications
CREATE POLICY "Consultants can withdraw own applications"
  ON applications FOR DELETE
  TO authenticated
  USING (consultant_id = auth.uid());

-- Managers and admins can delete applications
CREATE POLICY "Managers can delete applications"
  ON applications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );
