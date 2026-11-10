-- Allow unauthenticated (anon) users to read auth-relevant system settings.
-- AuthScreen runs before login, so it uses the anon key. Without this policy
-- the signup_roles_visible fetch returns [] and all roles fall back to visible.
CREATE POLICY "anon can read auth settings"
  ON system_settings
  FOR SELECT
  TO anon
  USING (key IN (
    'signup_roles_visible',
    'signup_flow_per_role',
    'role_permissions',
    'auto_approve_domains',
    'platform_name',
    'platform_tagline',
    'brand_logo_url'
  ));
