-- Add required_roles to cases and role_assignments to applications
-- required_roles: [{ id, label, description, required_skills[] }]
-- role_assignments: [{ role_id, role_label, consultant_id, consultant_name }]

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS required_roles JSONB DEFAULT '[]'::jsonb;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS role_assignments JSONB DEFAULT '[]'::jsonb;
