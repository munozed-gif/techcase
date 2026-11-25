-- Plan upgrades without online payments: when Settings → Payments is off (or the gateway is not set up),
-- the upgrade buttons send a request that an administrator approves on the Approvals page. Approving
-- applies the plan the same way the Stripe webhook does (user_plans / users.is_pro, or partners.plan).
CREATE TABLE IF NOT EXISTS public.plan_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_type    text NOT NULL,                 -- client | consultant | headhunter | user (AI Pro) | partner
  plan_key     text NOT NULL,                 -- growth | enterprise | pro | agency | ai_pro
  partner_id   uuid REFERENCES public.partners(id),
  note         text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by   uuid,
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_requests_pending_idx ON public.plan_requests (status, created_at);
ALTER TABLE public.plan_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plan_requests' AND policyname = 'plan_requests_read') THEN
    CREATE POLICY plan_requests_read ON public.plan_requests FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.is_staff()
             OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id, ARRAY['owner'])));
  END IF;
END $$;

-- Ask for an upgrade. Returns the request id (an existing pending request for the same plan is reused).
CREATE OR REPLACE FUNCTION public.plan_request_create(p_role_type text, p_plan_key text, p_partner uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_name text; v_label text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Your account must be approved first' USING ERRCODE = '42501'; END IF;
  IF p_role_type NOT IN ('client', 'consultant', 'headhunter', 'user', 'partner') OR coalesce(p_plan_key, '') = '' THEN
    RAISE EXCEPTION 'Unknown plan' USING ERRCODE = '22023';
  END IF;
  IF p_role_type = 'partner' THEN
    IF p_partner IS NULL OR NOT public.is_partner_member(p_partner, ARRAY['owner']) THEN
      RAISE EXCEPTION 'Only the partner owner can ask for a partner plan' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT id INTO v_id FROM plan_requests
   WHERE user_id = auth.uid() AND role_type = p_role_type AND plan_key = p_plan_key
     AND partner_id IS NOT DISTINCT FROM p_partner AND status = 'pending' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO plan_requests (user_id, role_type, plan_key, partner_id, note)
  VALUES (auth.uid(), p_role_type, p_plan_key, p_partner, nullif(left(trim(coalesce(p_note, '')), 500), ''))
  RETURNING id INTO v_id;
  SELECT coalesce(full_name, email, 'A user') INTO v_name FROM users WHERE id = auth.uid();
  v_label := initcap(replace(p_plan_key, '_', ' ')) || CASE WHEN p_role_type = 'partner' THEN ' (partner ' || coalesce((SELECT name FROM partners WHERE id = p_partner), '') || ')' WHEN p_role_type = 'user' THEN '' ELSE ' (' || p_role_type || ')' END;
  INSERT INTO notifications (user_id, title, body, is_read, event_type)
  SELECT u.id, 'Plan upgrade request', v_name || ' asked for ' || v_label || '. Approve it on the Approvals page.', false, 'plan_request'
  FROM users u WHERE u.role::text = 'admin' AND u.verification_status = 'approved';
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.plan_request_create(text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_request_create(text, text, uuid, text) TO authenticated;

-- The requester can withdraw a pending request.
CREATE OR REPLACE FUNCTION public.plan_request_cancel(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE plan_requests SET status = 'cancelled', decided_at = now() WHERE id = p_id AND user_id = auth.uid() AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.plan_request_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_request_cancel(uuid) TO authenticated;

-- Pending requests in the shape of admin_pending_approvals (merged by the Approvals page).
CREATE OR REPLACE FUNCTION public.plan_requests_pending()
RETURNS TABLE (kind text, id uuid, title text, approver text, approver_email text, requested_by text, status text, created_at timestamptz, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'plan_upgrade', r.id,
         initcap(replace(r.plan_key, '_', ' ')) || CASE WHEN r.role_type = 'partner' THEN ' — ' || coalesce(p.name, 'partner') WHEN r.role_type = 'user' THEN '' ELSE ' — ' || r.role_type END
           || coalesce(' · "' || r.note || '"', ''),
         'Platform administrator', NULL::text, coalesce(u.full_name, u.email), r.status, r.created_at, NULL::timestamptz
    FROM plan_requests r JOIN users u ON u.id = r.user_id LEFT JOIN partners p ON p.id = r.partner_id
   WHERE r.status = 'pending' AND public.is_staff()
   ORDER BY r.created_at;
$$;
REVOKE ALL ON FUNCTION public.plan_requests_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_requests_pending() TO authenticated;

-- Approve / reject. Approving applies the plan like the Stripe webhook.
CREATE OR REPLACE FUNCTION public.plan_request_decide(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r plan_requests%ROWTYPE; me users%ROWTYPE; v_plans jsonb; v_label text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO me FROM users WHERE id = auth.uid();
  SELECT * INTO r FROM plan_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'Request not found or already decided' USING ERRCODE = '22023'; END IF;
  v_label := initcap(replace(r.plan_key, '_', ' '));
  IF p_approve THEN
    IF r.role_type = 'partner' THEN
      UPDATE partners SET plan = CASE WHEN r.plan_key = 'pro' THEN 'pro' ELSE plan END, plan_updated_at = now() WHERE id = r.partner_id;
    ELSE
      SELECT coalesce(value, '{}'::jsonb) INTO v_plans FROM system_settings WHERE key = 'user_plans';
      v_plans := coalesce(v_plans, '{}'::jsonb) || jsonb_build_object(r.user_id::text,
                   jsonb_build_object('plan', r.plan_key, 'roleType', r.role_type, 'updatedAt', now(), 'approvedBy', auth.uid()));
      UPDATE system_settings SET value = v_plans, updated_at = now() WHERE key = 'user_plans';
      IF NOT FOUND THEN INSERT INTO system_settings (key, value, updated_at) VALUES ('user_plans', v_plans, now()); END IF;
      IF r.plan_key = 'ai_pro' THEN UPDATE users SET is_pro = true WHERE id = r.user_id; END IF;
    END IF;
  END IF;
  UPDATE plan_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '') WHERE id = p_id;
  INSERT INTO notifications (user_id, title, body, is_read, event_type)
  VALUES (r.user_id, CASE WHEN p_approve THEN 'Plan upgraded' ELSE 'Plan request not approved' END,
          CASE WHEN p_approve THEN 'Your ' || v_label || ' plan is active.' ELSE 'Your request for ' || v_label || ' was not approved.' END
          || coalesce(' ' || nullif(trim(coalesce(p_note, '')), ''), ''), false, 'plan_request');
  INSERT INTO audit_logs (user_id, user_email, user_name, event_type, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), me.email, me.full_name, 'plan_request.decided', 'plan_request', p_id::text, to_jsonb(CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END),
          jsonb_build_object('user_id', r.user_id, 'role_type', r.role_type, 'plan_key', r.plan_key, 'partner_id', r.partner_id, 'note', p_note));
  RETURN jsonb_build_object('ok', true, 'result', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END $$;
REVOKE ALL ON FUNCTION public.plan_request_decide(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_request_decide(uuid, boolean, text) TO authenticated;
