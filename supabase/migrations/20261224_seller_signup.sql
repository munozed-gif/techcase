-- "Seller" on the sign-up screen: the account is created with raw_user_meta_data.seller_request =
-- {headline, note}; the seller request is filed (pending, or approved when the sales settings do not
-- require approval) as soon as both the auth user and the public.users row exist.
CREATE OR REPLACE FUNCTION public._seller_from_signup(p_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req jsonb; v_status text; v_role text;
BEGIN
  SELECT raw_user_meta_data -> 'seller_request' INTO v_req FROM auth.users WHERE id = p_uid;
  IF v_req IS NULL OR jsonb_typeof(v_req) <> 'object' THEN RETURN; END IF;
  SELECT role::text INTO v_role FROM users WHERE id = p_uid;
  IF NOT FOUND THEN RETURN; END IF;                                   -- the users row comes later
  IF v_role IN ('client','invited_client','final_user','key_user') THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM sellers WHERE user_id = p_uid) THEN RETURN; END IF;
  v_status := CASE WHEN coalesce((public._sales_cfg() ->> 'independent_needs_approval')::boolean, true) THEN 'pending' ELSE 'approved' END;
  INSERT INTO sellers (user_id, status, headline, note, approved_at)
  VALUES (p_uid, v_status, nullif(left(trim(coalesce(v_req ->> 'headline', '')), 200), ''),
          nullif(left(trim(coalesce(v_req ->> 'note', '')), 500), ''), CASE WHEN v_status = 'approved' THEN now() END)
  ON CONFLICT (user_id) DO NOTHING;
  IF v_status = 'pending' THEN
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    SELECT u.id, 'sales', 'Seller request',
           coalesce((SELECT full_name FROM users WHERE id = p_uid), 'A new user') || ' signed up as a seller.',
           jsonb_build_object('seller_id', p_uid), 'sales'
    FROM users u WHERE u.role = 'admin' AND coalesce(u.is_active, true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_seller_from_signup: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public._seller_from_signup(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seller_from_signup_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'seller_request' THEN PERFORM public._seller_from_signup(NEW.id); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.seller_from_signup_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._seller_from_signup(NEW.id);
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_seller_request' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_seller_request AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.seller_from_signup_auth();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_users_seller_request' AND tgrelid = 'public.users'::regclass) THEN
    CREATE TRIGGER on_users_seller_request AFTER INSERT OR UPDATE OF role ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.seller_from_signup_users();
  END IF;
END $$;

-- Partner and Seller get their own switches in Settings → Sign-up access. Partner was shown whenever
-- Consultant was: keep it visible where Consultant is.
UPDATE system_settings SET value = value || '["partner"]'::jsonb
WHERE key = 'signup_roles_visible' AND jsonb_typeof(value) = 'array' AND value ? 'consultant' AND NOT value ? 'partner';
