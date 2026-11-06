-- Fix "infinite recursion detected in policy for relation cases" for anon.
-- Anon reads of cases (e.g. the /join/:token screen embedding cases) hit
-- cases_share_read -> projects -> projects_select -> cases -> ...
-- projects_select only grants rows via auth.uid() / get_my_role(), so it can
-- never match for anon; scoping it to authenticated breaks the loop with no
-- change in who can see what.
ALTER POLICY projects_select ON projects TO authenticated;
