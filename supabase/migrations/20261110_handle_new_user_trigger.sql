-- Create the public.users row whenever someone signs up (auth.users insert).
-- Without this, self sign-ups never appear in Roles & Permissions: regular
-- users have no INSERT policy on public.users, so the client-side fallback
-- insert in useAuth.jsx cannot create the row.
--
-- The role comes from sign-up metadata, which the signing-up user controls,
-- so only the roles offered on the sign-up screen are accepted; anything
-- else (e.g. admin, manager) falls back to consultant. New rows always start
-- as 'pending' so an admin approves them.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role text := new.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.users (id, email, full_name, role, verification_status)
  VALUES (
    new.id,
    new.email,
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    CASE WHEN meta_role IN ('consultant', 'client', 'key_user', 'final_user',
                            'internal_consultant', 'project_manager')
         THEN meta_role ELSE 'consultant' END,
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Never block sign-up because of this row
  RAISE LOG 'handle_new_user failed for %: %', new.id, SQLERRM;
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
