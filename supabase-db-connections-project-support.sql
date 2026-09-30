-- Allow db_connections to exist at project level (no client required).
-- Consultant-created projects don't have a client_id.

-- 1. Make client_id nullable
ALTER TABLE db_connections ALTER COLUMN client_id DROP NOT NULL;

-- 2. Add project_id column if it doesn't already exist
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- 3. Add meta column for SAP-specific fields if missing
ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

-- 4. Drop the old client-only RLS policy and replace with one that covers
--    both client-owned and project-level connections.
DROP POLICY IF EXISTS "client_own_connections" ON db_connections;

-- Clients can see their own connections
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'client_own_connections_v2' AND tablename = 'db_connections'
  ) THEN
    CREATE POLICY "client_own_connections_v2" ON db_connections
      FOR ALL
      USING (client_id = auth.uid());
  END IF;
END$$;

-- Admins and managers can see/manage all connections
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'staff_manage_connections' AND tablename = 'db_connections'
  ) THEN
    CREATE POLICY "staff_manage_connections" ON db_connections
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid() AND role IN ('admin', 'manager', 'consultant')
        )
      );
  END IF;
END$$;
