-- Partner sign-up: the sign-up screen's "Partner" option creates a consultant account with
-- user_metadata.partner_request = { name, kind }. From that, a pending partner (owned by the new
-- user, via_signup = true) is created as soon as the account exists — even before the email is
-- confirmed — so administrators see it next to the user in the approval queue. When an
-- administrator approves the user, their sign-up partner is approved with them (one approval).
-- Auto-approved accounts (OTP flow / approved domains) keep the partner pending for review in
-- Settings → Partners.

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS via_signup boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.partner_from_signup_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req jsonb; v_name text; v_kind text; v_id uuid;
BEGIN
  v_req := NEW.raw_user_meta_data -> 'partner_request';
  IF v_req IS NULL OR jsonb_typeof(v_req) <> 'object' THEN RETURN NEW; END IF;
  v_name := left(trim(coalesce(v_req ->> 'name', '')), 120);
  v_kind := CASE WHEN v_req ->> 'kind' = 'firm' THEN 'firm' ELSE 'individual' END;
  IF v_name = '' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM partners WHERE owner_id = NEW.id AND status IN ('pending', 'approved')) THEN RETURN NEW; END IF;
  INSERT INTO partners (name, kind, owner_id, plan, status, request_note, via_signup)
  VALUES (v_name, v_kind, NEW.id, 'free', 'pending', nullif(left(trim(coalesce(v_req ->> 'note', '')), 500), ''), true)
  RETURNING id INTO v_id;
  INSERT INTO partner_members (partner_id, user_id, role) VALUES (v_id, NEW.id, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the sign-up itself; the user can still request from the Partner menu.
  RAISE WARNING 'partner_from_signup_meta: %', SQLERRM;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_partner_request' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_partner_request
      AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.partner_from_signup_meta();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.approve_signup_partner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status = 'approved' AND OLD.verification_status IS DISTINCT FROM 'approved' AND public.is_staff() THEN
    UPDATE partners SET status = 'approved', approved_at = now(), approved_by = auth.uid()
     WHERE owner_id = NEW.id AND via_signup AND status = 'pending';
  ELSIF NEW.verification_status = 'rejected' AND OLD.verification_status IS DISTINCT FROM 'rejected' AND public.is_staff() THEN
    UPDATE partners SET status = 'rejected', review_note = coalesce(review_note, 'Account not approved')
     WHERE owner_id = NEW.id AND via_signup AND status = 'pending';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'approve_signup_partner' AND tgrelid = 'public.users'::regclass) THEN
    CREATE TRIGGER approve_signup_partner AFTER UPDATE OF verification_status ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.approve_signup_partner();
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.partner_from_signup_meta(), public.approve_signup_partner() FROM PUBLIC, anon, authenticated;
