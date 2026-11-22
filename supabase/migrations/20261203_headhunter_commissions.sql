-- Headhunter placement fee (one-time), charged to the customer; the platform records the payout.
--   When an application proposed by a headhunter is accepted (the placement is confirmed):
--     fee = commission % × candidate's rate × case planned hours
--       % : application.headhunter_commission_pct, else Settings → Headhunters default_commission_pct (15)
--       rate : application.proposed_rate, else the consultant's profile rate
--       hours: case activity plan (standard estimate), else Settings → Headhunters placement_default_hours (160)
--     → hh_commissions row + an invoice to the customer (kind 'hh_commission', status 'sent', due in 30 days)
--   No approval step. Admins/managers record the payment to the headhunter, adjust or cancel.
-- No DROP / DELETE.

CREATE TABLE IF NOT EXISTS public.hh_commissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  case_id        uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  headhunter_id  uuid NOT NULL REFERENCES public.users(id),
  consultant_id  uuid NOT NULL REFERENCES public.users(id),
  customer_id    uuid,
  pct            numeric NOT NULL,
  rate           numeric,
  base_hours     numeric NOT NULL,
  hours_source   text NOT NULL CHECK (hours_source IN ('plan','default','manual')),
  currency       text NOT NULL DEFAULT 'USD',
  amount         numeric NOT NULL DEFAULT 0,
  invoice_id     uuid,
  payout_status  text NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending','paid','cancelled')),
  paid_at        date,
  paid_by        uuid,
  payment_ref    text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hh_commissions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hh_commissions' AND policyname='hh_commissions_read') THEN
    CREATE POLICY hh_commissions_read ON public.hh_commissions FOR SELECT TO authenticated
      USING (headhunter_id = auth.uid() OR public.is_staff());
  END IF;
END $$;
CREATE OR REPLACE TRIGGER hh_commissions_touch BEFORE UPDATE ON public.hh_commissions
  FOR EACH ROW EXECUTE FUNCTION public.proposals_touch_updated_at();

-- Customer invoice for a commission (created once the amount is > 0)
CREATE OR REPLACE FUNCTION public._hh_commission_invoice(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k hh_commissions%ROWTYPE; c cases%ROWTYPE; v_inv uuid; v_name text;
BEGIN
  SELECT * INTO k FROM hh_commissions WHERE id = p_id;
  IF k.invoice_id IS NOT NULL OR coalesce(k.amount, 0) <= 0 OR k.payout_status = 'cancelled' THEN RETURN k.invoice_id; END IF;
  SELECT * INTO c FROM cases WHERE id = k.case_id;
  SELECT full_name INTO v_name FROM users WHERE id = k.consultant_id;
  INSERT INTO invoices (invoice_number, client_id, case_id, amount, status, issue_date, due_date, notes, kind, currency, project_id)
  VALUES ('HHC-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          c.client_id, k.case_id, round(k.amount, 2), 'sent', current_date, current_date + 30,
          format('Headhunter placement fee — %s on "%s": %s%% × %s/h × %s h', coalesce(v_name, 'consultant'), c.title, k.pct, k.rate, k.base_hours),
          'hh_commission', k.currency, c.project_id)
  RETURNING id INTO v_inv;
  UPDATE hh_commissions SET invoice_id = v_inv WHERE id = p_id;
  IF c.client_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (c.client_id, 'invoice', 'Placement fee invoice',
            format('Placement fee for %s on "%s": %s %s.', coalesce(v_name, 'the consultant'), c.title, round(k.amount, 2), k.currency),
            jsonb_build_object('invoice_id', v_inv, 'case_id', k.case_id), 'invoice');
  END IF;
  RETURN v_inv;
END $$;
REVOKE ALL ON FUNCTION public._hh_commission_invoice(uuid) FROM public, anon, authenticated;

-- Placement confirmed → commission + customer invoice
CREATE OR REPLACE FUNCTION public.hh_commission_on_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c cases%ROWTYPE; v_pct numeric; v_rate numeric; v_hours numeric; v_src text; v_amount numeric; v_id uuid; v_hh jsonb; v_name text;
BEGIN
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' OR NEW.submitted_by_headhunter_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM hh_commissions WHERE application_id = NEW.id) THEN RETURN NEW; END IF;
  SELECT * INTO c FROM cases WHERE id = NEW.case_id;
  SELECT value INTO v_hh FROM system_settings WHERE key = 'headhunter_settings';
  v_pct  := coalesce(NEW.headhunter_commission_pct, NULLIF(v_hh ->> 'default_commission_pct', '')::numeric, 15);
  v_rate := coalesce(NEW.proposed_rate, (SELECT hourly_rate FROM consultant_profiles WHERE id = NEW.consultant_id));
  SELECT sum(coalesce(est_hours_manual, est_hours, 0)) INTO v_hours FROM case_activities WHERE case_id = NEW.case_id;
  IF coalesce(v_hours, 0) > 0 THEN v_src := 'plan';
  ELSE v_hours := coalesce(NULLIF(v_hh ->> 'placement_default_hours', '')::numeric, 160); v_src := 'default'; END IF;
  v_amount := round(coalesce(v_pct, 0) / 100 * coalesce(v_rate, 0) * v_hours, 2);

  INSERT INTO hh_commissions (application_id, case_id, headhunter_id, consultant_id, customer_id, pct, rate, base_hours, hours_source, currency, amount)
  VALUES (NEW.id, NEW.case_id, NEW.submitted_by_headhunter_id, NEW.consultant_id, c.client_id, v_pct, v_rate, v_hours, v_src,
          coalesce(NULLIF(trim(c.currency), ''), 'USD'), v_amount)
  RETURNING id INTO v_id;
  UPDATE applications SET headhunter_commission_amount = v_amount, headhunter_commission_pct = v_pct WHERE id = NEW.id;
  PERFORM public._hh_commission_invoice(v_id);

  SELECT full_name INTO v_name FROM users WHERE id = NEW.consultant_id;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (NEW.submitted_by_headhunter_id, 'headhunter', 'Placement fee earned',
          format('%s was accepted on "%s". Placement fee: %s %s (%s%% × %s/h × %s h).%s', coalesce(v_name, 'Your candidate'), c.title,
                 v_amount, coalesce(NULLIF(trim(c.currency), ''), 'USD'), v_pct, coalesce(v_rate, 0), v_hours,
                 CASE WHEN v_amount <= 0 THEN ' The amount needs to be set by an administrator.' ELSE '' END),
          jsonb_build_object('commission_id', v_id, 'case_id', NEW.case_id), 'headhunter');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, new_value, metadata)
  VALUES ('headhunter.commission_created', NEW.submitted_by_headhunter_id, 'case', NEW.case_id::text, c.title,
          jsonb_build_object('amount', v_amount, 'pct', v_pct, 'rate', v_rate, 'hours', v_hours), jsonb_build_object('application_id', NEW.id));
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER hh_commission_on_accept AFTER UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.hh_commission_on_accept();

-- Staff: set / correct the amount (e.g. no rate or no plan), creating the customer invoice if missing
CREATE OR REPLACE FUNCTION public.hh_commission_set_amount(p_id uuid, p_amount numeric, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k hh_commissions%ROWTYPE; v_inv_status text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM hh_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found' USING ERRCODE = '22023'; END IF;
  IF k.payout_status <> 'pending' THEN RAISE EXCEPTION 'Only pending commissions can be changed' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Enter a valid amount' USING ERRCODE = '22023'; END IF;
  IF k.invoice_id IS NOT NULL THEN
    SELECT status INTO v_inv_status FROM invoices WHERE id = k.invoice_id;
    IF v_inv_status = 'paid' THEN RAISE EXCEPTION 'The customer already paid this fee' USING ERRCODE = '22023'; END IF;
    UPDATE invoices SET amount = round(p_amount, 2), notes = notes || ' — adjusted' WHERE id = k.invoice_id;
  END IF;
  UPDATE hh_commissions SET amount = round(p_amount, 2), hours_source = 'manual',
         note = coalesce(NULLIF(trim(coalesce(p_note, '')), ''), note) WHERE id = p_id;
  UPDATE applications SET headhunter_commission_amount = round(p_amount, 2) WHERE id = k.application_id;
  PERFORM public._hh_commission_invoice(p_id);
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, old_value, new_value)
  VALUES ('headhunter.commission_adjusted', auth.uid(), 'case', k.case_id::text, jsonb_build_object('amount', k.amount), jsonb_build_object('amount', p_amount));
END $$;

-- Staff: record the payment to the headhunter
CREATE OR REPLACE FUNCTION public.hh_commission_record_payment(p_id uuid, p_paid_at date DEFAULT current_date, p_ref text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k hh_commissions%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM hh_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR k.payout_status <> 'pending' THEN RAISE EXCEPTION 'Commission not found or not pending' USING ERRCODE = '22023'; END IF;
  UPDATE hh_commissions SET payout_status = 'paid', paid_at = coalesce(p_paid_at, current_date), paid_by = auth.uid(),
         payment_ref = NULLIF(trim(coalesce(p_ref, '')), ''), note = coalesce(NULLIF(trim(coalesce(p_note, '')), ''), note) WHERE id = p_id;
  UPDATE applications SET headhunter_commission_paid = true, headhunter_commission_paid_at = now() WHERE id = k.application_id;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (k.headhunter_id, 'headhunter', 'Placement fee paid',
          format('Your placement fee of %s %s was paid%s.', k.amount, k.currency, coalesce(' (ref. ' || NULLIF(trim(coalesce(p_ref, '')), '') || ')', '')),
          jsonb_build_object('commission_id', p_id), 'headhunter');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, new_value)
  VALUES ('headhunter.commission_paid', auth.uid(), 'case', k.case_id::text, jsonb_build_object('amount', k.amount, 'ref', p_ref));
END $$;

-- Staff: cancel (e.g. the placement did not go ahead)
CREATE OR REPLACE FUNCTION public.hh_commission_cancel(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k hh_commissions%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM hh_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR k.payout_status <> 'pending' THEN RAISE EXCEPTION 'Commission not found or not pending' USING ERRCODE = '22023'; END IF;
  IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Add a reason' USING ERRCODE = '22023'; END IF;
  UPDATE hh_commissions SET payout_status = 'cancelled', note = trim(p_note) WHERE id = p_id;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (k.headhunter_id, 'headhunter', 'Placement fee cancelled', 'Reason: ' || trim(p_note), jsonb_build_object('commission_id', p_id), 'headhunter');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, new_value)
  VALUES ('headhunter.commission_cancelled', auth.uid(), 'case', k.case_id::text, jsonb_build_object('reason', p_note));
END $$;

-- Lists with names (user records are private)
CREATE OR REPLACE FUNCTION public.hh_commissions_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'amount', k.amount, 'currency', k.currency, 'pct', k.pct, 'rate', k.rate, 'base_hours', k.base_hours,
    'hours_source', k.hours_source, 'payout_status', k.payout_status, 'paid_at', k.paid_at, 'payment_ref', k.payment_ref,
    'note', k.note, 'created_at', k.created_at,
    'case', jsonb_build_object('id', c.id, 'title', c.title),
    'headhunter', jsonb_build_object('id', h.id, 'full_name', h.full_name),
    'consultant', jsonb_build_object('id', u.id, 'full_name', u.full_name),
    'invoice', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('id', i.id, 'number', i.invoice_number, 'status', i.status, 'due_date', i.due_date) END
  ) ORDER BY k.created_at DESC), '[]'::jsonb)
  FROM hh_commissions k JOIN cases c ON c.id = k.case_id JOIN users h ON h.id = k.headhunter_id JOIN users u ON u.id = k.consultant_id
  LEFT JOIN invoices i ON i.id = k.invoice_id
  WHERE public.is_staff() OR k.headhunter_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.hh_commission_set_amount(uuid, numeric, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_commission_record_payment(uuid, date, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_commission_cancel(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.hh_commissions_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hh_commission_set_amount(uuid, numeric, text), public.hh_commission_record_payment(uuid, date, text, text),
  public.hh_commission_cancel(uuid, text), public.hh_commissions_list() TO authenticated;
