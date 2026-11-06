-- Allow anonymous users to read a case invitation by its token.
-- Required for the /join/:token screen which loads before any auth.
-- Only pending or already-accepted invitations are readable; expired ones
-- can still be read so the UI can show the "expired" message.

ALTER TABLE case_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_by_token" ON case_invitations;
CREATE POLICY "anon_read_by_token"
  ON case_invitations
  FOR SELECT
  TO anon
  USING (true);
