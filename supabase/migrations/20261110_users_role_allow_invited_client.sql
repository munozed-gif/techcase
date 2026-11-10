-- ArenaSolPlatf only: its users.role is text with a CHECK list that was
-- missing invited_client, so /join sign-ups got no public.users row.
-- (Projects where role is the user_role enum already include it.)
ALTER TABLE public.users DROP CONSTRAINT users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY[
  'admin', 'manager', 'consultant', 'client', 'key_user', 'headhunter', 'final_user',
  'internal_consultant', 'project_manager', 'dispatch', 'area_leader', 'invited_client'
]::text[]));
