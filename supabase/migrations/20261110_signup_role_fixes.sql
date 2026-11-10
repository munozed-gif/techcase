-- Sign-up role fixes. Runs on both projects: public.users.role is text in
-- one and the user_role enum in the other, so role values are cast to the
-- column's actual type with dynamic SQL.
--
-- 1. handle_new_user: only roles the sign-up screens offer (plus
--    invited_client from the /join flow) are taken from sign-up metadata,
--    which the user controls. Anything else becomes consultant. Always pending.
-- 2. complete_signup(): the sign-up "Profile" step saves name + role through
--    this function instead of writing public.users directly. The server
--    decides verification_status from system_settings, and only approves
--    confirmed emails. Callable only while the account is still pending.
-- 3. guard_user_privileged_columns: users editing their own row through the
--    API (role authenticated) can no longer change role, approval fields,
--    is_active, is_pro or trust_level. Admins/managers, SECURITY DEFINER
--    functions and the service role are unaffected. A user may still set
--    their own verification_status to 'pending' (request-access flow).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role text := new.raw_user_meta_data->>'role';
  role_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO role_type
    FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'role';

  EXECUTE format(
    'INSERT INTO public.users (id, email, full_name, role, verification_status)
     VALUES ($1, $2, $3, $4::%s, ''pending'')
     ON CONFLICT (id) DO NOTHING', role_type)
  USING
    new.id,
    new.email,
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    CASE WHEN meta_role IN ('consultant', 'client', 'key_user', 'final_user', 'internal_consultant',
                            'project_manager', 'headhunter', 'invited_client')
         THEN meta_role ELSE 'consultant' END;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Never block sign-up because of this row
  RAISE LOG 'handle_new_user failed for %: %', new.id, SQLERRM;
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


CREATE OR REPLACE FUNCTION public.complete_signup(p_full_name text, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_status    text;
  v_approved  timestamptz;
  v_flow      text;
  v_domains   jsonb;
  v_domain_ok boolean := false;
  v_result    text;
  role_type   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('consultant', 'client', 'key_user', 'final_user',
                                      'internal_consultant', 'project_manager', 'headhunter') THEN
    RAISE EXCEPTION 'role % cannot be chosen at sign-up', p_role USING ERRCODE = '22023';
  END IF;

  SELECT email, email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;

  SELECT verification_status, approved_at INTO v_status, v_approved
    FROM public.users WHERE id = v_uid;
  IF FOUND AND (v_status IS DISTINCT FROM 'pending' OR v_approved IS NOT NULL) THEN
    RAISE EXCEPTION 'sign-up already completed' USING ERRCODE = '42501';
  END IF;

  SELECT value->>p_role INTO v_flow FROM system_settings WHERE key = 'signup_flow_per_role';
  v_flow := COALESCE(v_flow, 'email_verify');

  SELECT value INTO v_domains FROM system_settings WHERE key = 'auto_approve_domains';
  IF jsonb_typeof(v_domains) = 'array' THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_domains) d
      WHERE lower(trim(d)) = lower(split_part(v_email, '@', 2))
    ) INTO v_domain_ok;
  END IF;

  v_result := CASE
    WHEN v_confirmed IS NOT NULL AND (v_flow = 'email_verify' OR v_domain_ok) THEN 'approved'
    ELSE 'pending'
  END;

  SELECT format_type(atttypid, atttypmod) INTO role_type
    FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'role';

  EXECUTE format(
    'INSERT INTO public.users (id, email, full_name, role, verification_status)
     VALUES ($1, $2, $3, $4::%s, $5)
     ON CONFLICT (id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           verification_status = EXCLUDED.verification_status', role_type)
  USING v_uid, v_email,
        COALESCE(NULLIF(trim(p_full_name), ''), split_part(v_email, '@', 1)),
        p_role, v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_signup(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;


-- Runs as the caller (not SECURITY DEFINER) so current_user tells API
-- requests (authenticated/anon) apart from definer functions and service role.
CREATE OR REPLACE FUNCTION public.guard_user_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  my_role text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN new;
  END IF;

  SELECT role::text INTO my_role FROM public.users WHERE id = auth.uid();
  IF my_role IN ('admin', 'manager') THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new.role::text NOT IN ('consultant', 'client', 'key_user', 'final_user', 'internal_consultant',
                              'project_manager', 'headhunter', 'invited_client') THEN
      RAISE EXCEPTION 'role % cannot be self-assigned', new.role USING ERRCODE = '42501';
    END IF;
    new.verification_status := 'pending';
    new.approved_at := NULL;
    new.approved_by := NULL;
    new.rejection_reason := NULL;
    new.is_pro := false;
    new.trust_level := NULL;
    RETURN new;
  END IF;

  IF new.role IS DISTINCT FROM old.role
     OR new.approved_at IS DISTINCT FROM old.approved_at
     OR new.approved_by IS DISTINCT FROM old.approved_by
     OR new.rejection_reason IS DISTINCT FROM old.rejection_reason
     OR new.is_active IS DISTINCT FROM old.is_active
     OR new.is_pro IS DISTINCT FROM old.is_pro
     OR new.trust_level IS DISTINCT FROM old.trust_level
     OR (new.verification_status IS DISTINCT FROM old.verification_status
         AND new.verification_status IS DISTINCT FROM 'pending') THEN
    RAISE EXCEPTION 'only an admin can change role or approval fields' USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER guard_user_privileged_columns
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_privileged_columns();
