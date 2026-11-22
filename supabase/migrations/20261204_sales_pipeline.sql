-- Sales pipeline: sellers (independent or inside a partner), opportunities with customer
-- protection, packaged solutions, presale projects, delivery handoff (own team, named partner,
-- open bidding by partners / teams, or the Arena) and one-time seller commissions.
-- Seller is a capability on top of an account (table sellers), not a users.role value.
-- No DROP / DELETE.

-- ── Settings ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sales_cfg()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT '{"protection_enabled":true,"protection_days":90,"default_commission_pct":5,"default_payer":"customer","independent_needs_approval":true}'::jsonb
         || coalesce((SELECT CASE WHEN jsonb_typeof(value) = 'object' THEN value END FROM system_settings WHERE key = 'sales_settings'), '{}'::jsonb);
$$;

-- ── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sellers (
  user_id                uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id             uuid REFERENCES public.partners(id),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  headline               text,
  note                   text,
  review_note            text,
  default_commission_pct numeric,
  approved_by            uuid,
  approved_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.solutions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid REFERENCES public.partners(id),          -- NULL = platform solution
  title          text NOT NULL,
  summary        text,
  description    text,
  solution_type  text NOT NULL DEFAULT 'package' CHECK (solution_type IN ('implementation','upgrade','rollout','package','support','other')),
  sap_areas      text[] NOT NULL DEFAULT '{}',
  price_type     text NOT NULL DEFAULT 'quote' CHECK (price_type IN ('fixed','from','monthly','quote')),
  price          numeric,
  currency       text NOT NULL DEFAULT 'USD',
  duration_weeks int,
  case_templates jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{title, description, area_sap, case_type, est_hours}]
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id        uuid NOT NULL REFERENCES public.users(id),
  partner_id       uuid REFERENCES public.partners(id),        -- seller's partner (partner sellers)
  title            text NOT NULL,
  prospect_company text NOT NULL,
  company_key      text NOT NULL,
  email_domain     text,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  country          text,
  industry         text,
  need_type        text NOT NULL DEFAULT 'implementation' CHECK (need_type IN ('implementation','upgrade','new_area','rollout','solution','support','other')),
  sap_area         text,
  description      text,
  solution_id      uuid REFERENCES public.solutions(id),
  est_value        numeric,
  currency         text NOT NULL DEFAULT 'USD',
  expected_close   date,
  stage            text NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','qualified','proposal','won','lost')),
  lost_reason      text,
  protection_until date,
  project_id       uuid REFERENCES public.projects(id),
  commission_pct   numeric,
  commission_payer text NOT NULL DEFAULT 'customer' CHECK (commission_payer IN ('customer','delivery_partner','platform')),
  delivery_mode    text CHECK (delivery_mode IN ('own','partner','open','arena')),
  delivery_status  text NOT NULL DEFAULT 'none' CHECK (delivery_status IN ('none','pending','assigned')),
  won_at           timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunities_company_key_idx ON public.opportunities (company_key);
CREATE INDEX IF NOT EXISTS opportunities_project_idx ON public.opportunities (project_id);
CREATE INDEX IF NOT EXISTS opportunities_seller_idx ON public.opportunities (seller_id);

CREATE TABLE IF NOT EXISTS public.project_deliveries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id),
  mode           text NOT NULL CHECK (mode IN ('own','request','bid')),
  partner_id     uuid REFERENCES public.partners(id),
  team_id        uuid REFERENCES public.consultant_teams(id),
  submitted_by   uuid,
  price          numeric,
  currency       text,
  start_date     date,
  team_summary   text,
  note           text,
  status         text NOT NULL CHECK (status IN ('requested','submitted','awarded','declined','withdrawn','not_selected')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  CHECK (partner_id IS NOT NULL OR team_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS project_deliveries_project_idx ON public.project_deliveries (project_id) WHERE status = 'awarded';
CREATE INDEX IF NOT EXISTS project_deliveries_opp_idx ON public.project_deliveries (opportunity_id);

CREATE TABLE IF NOT EXISTS public.sales_commissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    uuid NOT NULL UNIQUE REFERENCES public.opportunities(id) ON DELETE CASCADE,
  seller_id         uuid NOT NULL REFERENCES public.users(id),
  seller_partner_id uuid,
  proposal_id       uuid,
  base_amount       numeric NOT NULL DEFAULT 0,
  pct               numeric NOT NULL,
  amount            numeric NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'USD',
  payer             text NOT NULL CHECK (payer IN ('customer','delivery_partner','platform')),
  payer_user_id     uuid,
  invoice_id        uuid,
  payout_status     text NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending','paid','cancelled')),
  paid_at           date,
  paid_by           uuid,
  payment_ref       text,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sellers','solutions','opportunities','project_deliveries','sales_commissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_touch' AND tgrelid = ('public.' || t)::regclass) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.proposals_touch_updated_at()', t || '_touch', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'zz_sec_approved_only') THEN
      EXECUTE format('CREATE POLICY zz_sec_approved_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_approved_user())) WITH CHECK ((SELECT public.is_approved_user()))', t);
    END IF;
  END LOOP;
END $$;

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sales_norm_company(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(
           regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9áéíóúñü ]', ' ', 'g'), '\s+', ' ', 'g'),
           '\m(s ?a ?b? ?de ?c ?v|de ?c ?v|s ?a ?p ?i|s ?a ?b|s ?a|s ?l|s ?r ?l|s ?a ?s|inc|ltd|llc|corp|corporation|gmbh|ag|plc|co|cia|compania|company|group|grupo)\M', ' ', 'g'))
$$;
CREATE OR REPLACE FUNCTION public._sales_company_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(public._sales_norm_company(p), '\s+', '', 'g')
$$;
CREATE OR REPLACE FUNCTION public._sales_email_domain(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN d IS NULL OR d = '' OR d IN ('gmail.com','hotmail.com','outlook.com','yahoo.com','live.com','icloud.com','proton.me','protonmail.com','aol.com','msn.com','yahoo.es','hotmail.es','outlook.es')
              THEN NULL ELSE d END
  FROM (SELECT lower(trim(split_part(coalesce(p, ''), '@', 2))) d) x
$$;

CREATE OR REPLACE FUNCTION public.is_approved_seller(u uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u IS NOT NULL AND EXISTS (SELECT 1 FROM sellers s WHERE s.user_id = u AND s.status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.is_project_seller(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND p_project IS NOT NULL
     AND EXISTS (SELECT 1 FROM opportunities o WHERE o.project_id = p_project AND o.seller_id = auth.uid());
$$;

-- Member of the partner or team that won the delivery of the project.
-- p_manage: only partner owners/admins and team owners.
CREATE OR REPLACE FUNCTION public.is_project_delivery_member(p_project uuid, p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND p_project IS NOT NULL AND EXISTS (
    SELECT 1 FROM project_deliveries d
    WHERE d.project_id = p_project AND d.status = 'awarded'
      AND ((d.partner_id IS NOT NULL AND public.is_partner_member(d.partner_id, CASE WHEN p_manage THEN ARRAY['owner','admin'] END))
        OR (d.team_id IS NOT NULL AND EXISTS (SELECT 1 FROM consultant_team_members m WHERE m.team_id = d.team_id AND m.user_id = auth.uid()
                                              AND (m.role = 'owner' OR (NOT p_manage AND m.status = 'accepted'))))));
$$;

-- Can the current user bid for / answer deliveries on behalf of this partner or team?
CREATE OR REPLACE FUNCTION public._can_act_for_delivery(p_partner uuid, p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (p_partner IS NOT NULL AND public.is_partner_member(p_partner, ARRAY['owner','admin'])
          AND EXISTS (SELECT 1 FROM partners p WHERE p.id = p_partner AND p.status = 'approved'))
      OR (p_team IS NOT NULL AND public._is_team_owner(p_team));
$$;

-- ── Policies ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sellers' AND policyname='sellers_read') THEN
    CREATE POLICY sellers_read ON public.sellers FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.is_staff() OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id, ARRAY['owner','admin'])));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='solutions' AND policyname='solutions_read') THEN
    CREATE POLICY solutions_read ON public.solutions FOR SELECT TO authenticated
      USING (status = 'published' OR public.is_staff() OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='solutions' AND policyname='solutions_write') THEN
    CREATE POLICY solutions_write ON public.solutions FOR ALL TO authenticated
      USING (public.is_staff() OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id, ARRAY['owner','admin'])))
      WITH CHECK (public.is_staff() OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id, ARRAY['owner','admin'])));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='opportunities' AND policyname='opportunities_read') THEN
    CREATE POLICY opportunities_read ON public.opportunities FOR SELECT TO authenticated
      USING (seller_id = auth.uid() OR public.is_staff() OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id, ARRAY['owner','admin'])));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_deliveries' AND policyname='deliveries_read') THEN
    CREATE POLICY deliveries_read ON public.project_deliveries FOR SELECT TO authenticated
      USING (public.is_staff() OR public._can_act_for_delivery(partner_id, team_id)
             OR (partner_id IS NOT NULL AND public.is_partner_member(partner_id))
             OR EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_id AND o.seller_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_commissions' AND policyname='sales_commissions_read') THEN
    CREATE POLICY sales_commissions_read ON public.sales_commissions FOR SELECT TO authenticated
      USING (seller_id = auth.uid() OR public.is_staff());
  END IF;

  -- Presale project: the seller works on it; the winning delivery partner / team works on it.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_sales_read') THEN
    CREATE POLICY projects_sales_read ON public.projects FOR SELECT TO authenticated
      USING (public.is_project_seller(id) OR public.is_project_delivery_member(id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='projects' AND policyname='projects_sales_update') THEN
    CREATE POLICY projects_sales_update ON public.projects FOR UPDATE TO authenticated
      USING (public.is_project_seller(id) OR public.is_project_delivery_member(id, true))
      WITH CHECK (public.is_project_seller(id) OR public.is_project_delivery_member(id, true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='cases_sales_read') THEN
    CREATE POLICY cases_sales_read ON public.cases FOR SELECT TO authenticated
      USING (project_id IS NOT NULL AND (public.is_project_seller(project_id) OR public.is_project_delivery_member(project_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='cases_sales_update') THEN
    CREATE POLICY cases_sales_update ON public.cases FOR UPDATE TO authenticated
      USING (project_id IS NOT NULL AND (public.is_project_seller(project_id) OR public.is_project_delivery_member(project_id)))
      WITH CHECK (project_id IS NOT NULL AND (public.is_project_seller(project_id) OR public.is_project_delivery_member(project_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='cases_sales_insert') THEN
    CREATE POLICY cases_sales_insert ON public.cases FOR INSERT TO authenticated
      WITH CHECK (project_id IS NOT NULL AND (public.is_project_seller(project_id) OR public.is_project_delivery_member(project_id, true)));
  END IF;
END $$;

-- Access helpers used across the app: add seller and delivery side.
CREATE OR REPLACE FUNCTION public.user_can_access_case(p_case uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
      OR EXISTS (
        SELECT 1 FROM cases c
        WHERE c.id = p_case
          AND (c.client_id = auth.uid() OR c.created_by = auth.uid() OR c.manager_id = auth.uid()
               OR c.area_leader_id = auth.uid() OR c.head_hunter_id = auth.uid() OR c.reviewer_user_id = auth.uid()
               OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.consultant_id = auth.uid())
               OR EXISTS (SELECT 1 FROM case_key_users k WHERE k.case_id = c.id AND k.user_id = auth.uid())
               OR EXISTS (SELECT 1 FROM projects p WHERE p.id = c.project_id
                          AND (p.client_id = auth.uid() OR p.created_by = auth.uid()))
               OR public.is_partner_member(c.partner_id)
               OR public.is_customer_member(c.customer_id)
               OR public.is_project_seller(c.project_id)
               OR public.is_project_delivery_member(c.project_id))
      );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
      OR public.user_owns_project(p_project) OR public.user_involved_in_project_cases(p_project)
      OR public.is_project_seller(p_project) OR public.is_project_delivery_member(p_project)
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project
                 AND (public.is_partner_member(p.partner_id) OR public.is_customer_member(p.customer_id)));
$$;

-- The seller manages the proposals of their presale project.
CREATE OR REPLACE FUNCTION public.can_manage_proposals(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    coalesce(public.get_my_role(), '') = 'admin'
    OR public.role_permission('manage_proposals', '{"admin":true,"manager":true}'::jsonb)
    OR (EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project AND p.created_by = auth.uid())
        AND public.role_permission('manage_own_project_proposals',
              '{"admin":true,"manager":true,"client":true,"project_manager":true}'::jsonb))
    OR (public.is_project_seller(p_project) AND public.is_approved_seller())
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project AND p.partner_id IS NOT NULL
        AND public.is_partner_member(p.partner_id, ARRAY['owner','admin'])
        AND coalesce((public.partner_limits(p.partner_id) ->> 'proposals')::boolean, true)
    ));
$$;

-- Project guard: presale projects created by the sales RPC skip the role check
-- (the RPC checks the seller and the partner limit itself).
CREATE OR REPLACE FUNCTION public.guard_project_partner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cust customers%ROWTYPE; v_role text := coalesce(get_my_role(), ''); v_server boolean;
BEGIN
  v_server := coalesce(auth.role(), '') NOT IN ('authenticated', 'anon')
              OR coalesce(current_setting('arena.sales_rpc', true), '') = 'on';
  IF NEW.customer_id IS NOT NULL THEN
    SELECT * INTO v_cust FROM customers WHERE id = NEW.customer_id;
    IF NEW.partner_id IS NOT NULL AND NEW.partner_id IS DISTINCT FROM v_cust.partner_id THEN
      RAISE EXCEPTION 'The customer belongs to another partner' USING ERRCODE = '22023';
    END IF;
    NEW.partner_id := v_cust.partner_id;
    IF NEW.client_id IS NULL AND v_cust.client_user_id IS NOT NULL THEN NEW.client_id := v_cust.client_user_id; END IF;
  ELSIF NEW.client_id IS NOT NULL AND NEW.partner_id IS NULL THEN
    SELECT * INTO v_cust FROM customers WHERE client_user_id = NEW.client_id ORDER BY created_at LIMIT 1;
    IF FOUND THEN NEW.customer_id := v_cust.id; NEW.partner_id := v_cust.partner_id; END IF;
  END IF;

  IF v_server OR v_role IN ('admin', 'manager') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.partner_id IS NULL THEN
      IF v_role = 'consultant' THEN
        RAISE EXCEPTION 'Creating your own projects needs an approved Partner account (Profile → Become a Partner)' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    PERFORM public._partner_must_be_approved(NEW.partner_id);
    IF NOT public.is_partner_member(NEW.partner_id, ARRAY['owner', 'admin'])
       AND NOT (NEW.customer_id IS NOT NULL AND v_cust.client_user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Only the partner''s owner or admins can create its projects' USING ERRCODE = '42501';
    END IF;
    PERFORM public._check_limit(NEW.partner_id, 'maxProjects',
      (SELECT count(*) FROM projects WHERE partner_id = NEW.partner_id AND coalesce(status::text, '') NOT IN ('cancelled', 'completed', 'closed', 'archived')),
      'active project(s)');
  ELSIF NEW.partner_id IS DISTINCT FROM OLD.partner_id AND OLD.partner_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an administrator can move a project to another partner' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ── Sellers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seller_request(p_headline text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := coalesce(get_my_role(), ''); s sellers%ROWTYPE; v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Your account must be approved first' USING ERRCODE = '42501'; END IF;
  IF v_role IN ('client','invited_client','final_user','key_user') THEN
    RAISE EXCEPTION 'Customer accounts cannot be sellers' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM sellers WHERE user_id = auth.uid();
  IF FOUND AND s.status IN ('approved','pending') THEN RETURN s.status; END IF;
  IF FOUND AND s.status = 'suspended' THEN RAISE EXCEPTION 'Your seller access is suspended. Contact an administrator.' USING ERRCODE = '42501'; END IF;
  v_status := CASE WHEN public.is_staff() OR NOT coalesce((public._sales_cfg() ->> 'independent_needs_approval')::boolean, true) THEN 'approved' ELSE 'pending' END;
  INSERT INTO sellers (user_id, status, headline, note, approved_at, approved_by)
  VALUES (auth.uid(), v_status, NULLIF(trim(coalesce(p_headline, '')), ''), NULLIF(trim(coalesce(p_note, '')), ''),
          CASE WHEN v_status = 'approved' THEN now() END, CASE WHEN v_status = 'approved' THEN auth.uid() END)
  ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, headline = EXCLUDED.headline, note = EXCLUDED.note,
          review_note = NULL, approved_at = EXCLUDED.approved_at, approved_by = EXCLUDED.approved_by;
  IF v_status = 'pending' THEN
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    SELECT u.id, 'sales', 'Seller request', coalesce((SELECT full_name FROM users WHERE id = auth.uid()), 'A user') || ' asked to become a seller.',
           jsonb_build_object('seller_id', auth.uid()), 'sales'
    FROM users u WHERE u.role = 'admin' AND coalesce(u.is_active, true);
  END IF;
  RETURN v_status;
END $$;

CREATE OR REPLACE FUNCTION public.seller_review(p_user uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('approved','rejected','suspended') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023'; END IF;
  UPDATE sellers SET status = p_status, review_note = NULLIF(trim(coalesce(p_note, '')), ''),
         approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
         approved_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE approved_by END
   WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller not found' USING ERRCODE = '22023'; END IF;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (p_user, 'sales',
          CASE p_status WHEN 'approved' THEN 'Seller access approved' WHEN 'rejected' THEN 'Seller request rejected' ELSE 'Seller access suspended' END,
          coalesce(NULLIF(trim(coalesce(p_note, '')), ''), CASE WHEN p_status = 'approved' THEN 'You can now open Sales and register opportunities.' ELSE '' END),
          '{}'::jsonb, 'sales');
END $$;

-- Partner owner/admin turns a member into a seller of the partner (approved at once).
CREATE OR REPLACE FUNCTION public.partner_set_seller(p_partner uuid, p_user uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s sellers%ROWTYPE;
BEGIN
  IF NOT (public.is_staff() OR public.is_partner_member(p_partner, ARRAY['owner','admin'])) THEN
    RAISE EXCEPTION 'Only the partner''s owner or admins' USING ERRCODE = '42501';
  END IF;
  IF public._partner_role(p_partner, p_user) IS NULL THEN RAISE EXCEPTION 'The user is not a member of this partner' USING ERRCODE = '22023'; END IF;
  PERFORM public._partner_must_be_approved(p_partner);
  SELECT * INTO s FROM sellers WHERE user_id = p_user;
  IF p_on THEN
    IF FOUND AND s.partner_id IS NOT NULL AND s.partner_id <> p_partner AND s.status = 'approved' THEN
      RAISE EXCEPTION 'This user already sells for another partner' USING ERRCODE = '22023';
    END IF;
    INSERT INTO sellers (user_id, partner_id, status, approved_at, approved_by)
    VALUES (p_user, p_partner, 'approved', now(), auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET partner_id = p_partner, status = 'approved', approved_at = now(), approved_by = auth.uid(), review_note = NULL;
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (p_user, 'sales', 'You are a seller', 'You can now open Sales and register opportunities for ' || (SELECT name FROM partners WHERE id = p_partner) || '.', '{}'::jsonb, 'sales');
  ELSIF FOUND AND s.partner_id = p_partner THEN
    UPDATE sellers SET status = 'suspended', review_note = 'Removed by the partner' WHERE user_id = p_user;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.my_seller()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN s.user_id IS NULL THEN NULL ELSE jsonb_build_object(
    'status', s.status, 'partner_id', s.partner_id, 'partner_name', p.name, 'headline', s.headline,
    'review_note', s.review_note, 'default_commission_pct', s.default_commission_pct) END
  FROM (SELECT auth.uid() AS uid) x LEFT JOIN sellers s ON s.user_id = x.uid LEFT JOIN partners p ON p.id = s.partner_id;
$$;

CREATE OR REPLACE FUNCTION public.sellers_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', s.user_id, 'full_name', u.full_name, 'email', u.email, 'role', u.role, 'status', s.status,
    'partner_id', s.partner_id, 'partner_name', p.name, 'headline', s.headline, 'note', s.note,
    'review_note', s.review_note, 'default_commission_pct', s.default_commission_pct, 'created_at', s.created_at,
    'opportunities', (SELECT count(*) FROM opportunities o WHERE o.seller_id = s.user_id),
    'won', (SELECT count(*) FROM opportunities o WHERE o.seller_id = s.user_id AND o.stage = 'won')
  ) ORDER BY (s.status = 'pending') DESC, s.created_at DESC), '[]'::jsonb)
  FROM sellers s JOIN users u ON u.id = s.user_id LEFT JOIN partners p ON p.id = s.partner_id
  WHERE public.is_staff();
$$;

CREATE OR REPLACE FUNCTION public.seller_set_commission(p_user uuid, p_pct numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  IF p_pct IS NOT NULL AND (p_pct < 0 OR p_pct > 100) THEN RAISE EXCEPTION 'Enter a percentage between 0 and 100' USING ERRCODE = '22023'; END IF;
  UPDATE sellers SET default_commission_pct = p_pct WHERE user_id = p_user;
END $$;

-- ── Customer protection ────────────────────────────────────────────────────
-- Another seller's active, protected opportunity for the same company (or email domain).
CREATE OR REPLACE FUNCTION public.sales_check_conflict(p_company text, p_email text DEFAULT NULL, p_exclude uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text := public._sales_company_key(p_company); v_dom text := public._sales_email_domain(p_email); o opportunities%ROWTYPE;
BEGIN
  IF NOT coalesce((public._sales_cfg() ->> 'protection_enabled')::boolean, true) OR coalesce(v_key, '') = '' THEN
    RETURN jsonb_build_object('conflict', false);
  END IF;
  SELECT * INTO o FROM opportunities x
   WHERE x.seller_id <> auth.uid() AND (p_exclude IS NULL OR x.id <> p_exclude)
     AND x.stage NOT IN ('won','lost') AND x.protection_until >= current_date
     AND (x.company_key = v_key OR (v_dom IS NOT NULL AND x.email_domain = v_dom))
   ORDER BY x.protection_until DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('conflict', false); END IF;
  RETURN jsonb_build_object('conflict', true, 'until', o.protection_until, 'company', o.prospect_company,
    'seller', CASE WHEN public.is_staff() THEN (SELECT full_name FROM users WHERE id = o.seller_id) END);
END $$;

-- ── Opportunities ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._opp_can_edit(o opportunities)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff() OR (o.seller_id = auth.uid() AND public.is_approved_seller());
$$;

CREATE OR REPLACE FUNCTION public.opportunity_save(p_id uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o opportunities%ROWTYPE; s sellers%ROWTYPE; v_cfg jsonb := public._sales_cfg(); v_conf jsonb;
        v_company text := NULLIF(trim(coalesce(p ->> 'prospect_company', '')), '');
        v_email text := NULLIF(trim(coalesce(p ->> 'contact_email', '')), '');
        v_pct numeric; v_payer text;
BEGIN
  IF p_id IS NULL THEN
    SELECT * INTO s FROM sellers WHERE user_id = auth.uid() AND status = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'You need approved seller access (Profile → Become a seller)' USING ERRCODE = '42501'; END IF;
    IF v_company IS NULL OR NULLIF(trim(coalesce(p ->> 'title', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Enter the opportunity title and the company' USING ERRCODE = '22023';
    END IF;
    v_conf := public.sales_check_conflict(v_company, v_email, NULL);
    IF (v_conf ->> 'conflict')::boolean THEN
      RAISE EXCEPTION 'This customer is already registered by another seller until %', v_conf ->> 'until' USING ERRCODE = '23505';
    END IF;
    v_payer := coalesce(NULLIF(p ->> 'commission_payer', ''), v_cfg ->> 'default_payer', 'customer');
    v_pct := coalesce(NULLIF(p ->> 'commission_pct', '')::numeric, s.default_commission_pct, (v_cfg ->> 'default_commission_pct')::numeric, 5);
    INSERT INTO opportunities (seller_id, partner_id, title, prospect_company, company_key, email_domain, contact_name, contact_email,
                               contact_phone, country, industry, need_type, sap_area, description, solution_id, est_value, currency,
                               expected_close, protection_until, commission_pct, commission_payer)
    VALUES (auth.uid(), s.partner_id, trim(p ->> 'title'), v_company, public._sales_company_key(v_company), public._sales_email_domain(v_email),
            NULLIF(trim(coalesce(p ->> 'contact_name', '')), ''), v_email, NULLIF(trim(coalesce(p ->> 'contact_phone', '')), ''),
            NULLIF(p ->> 'country', ''), NULLIF(p ->> 'industry', ''), coalesce(NULLIF(p ->> 'need_type', ''), 'implementation'),
            NULLIF(p ->> 'sap_area', ''), NULLIF(p ->> 'description', ''), NULLIF(p ->> 'solution_id', '')::uuid,
            NULLIF(p ->> 'est_value', '')::numeric, coalesce(NULLIF(p ->> 'currency', ''), 'USD'), NULLIF(p ->> 'expected_close', '')::date,
            CASE WHEN coalesce((v_cfg ->> 'protection_enabled')::boolean, true)
                 THEN current_date + coalesce((v_cfg ->> 'protection_days')::int, 90) END,
            v_pct, v_payer)
    RETURNING * INTO o;
    INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, new_value)
    VALUES ('sales.opportunity_created', auth.uid(), 'opportunity', o.id::text, o.title, jsonb_build_object('company', o.prospect_company));
    RETURN o.id;
  END IF;

  SELECT * INTO o FROM opportunities WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public._opp_can_edit(o) THEN RAISE EXCEPTION 'Opportunity not found' USING ERRCODE = '42501'; END IF;
  IF v_company IS NOT NULL AND public._sales_company_key(v_company) <> o.company_key OR (v_email IS DISTINCT FROM o.contact_email AND p ? 'contact_email') THEN
    v_conf := public.sales_check_conflict(coalesce(v_company, o.prospect_company), coalesce(v_email, o.contact_email), o.id);
    IF (v_conf ->> 'conflict')::boolean AND NOT public.is_staff() THEN
      RAISE EXCEPTION 'This customer is already registered by another seller until %', v_conf ->> 'until' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE opportunities SET
    title            = coalesce(NULLIF(trim(coalesce(p ->> 'title', '')), ''), title),
    prospect_company = coalesce(v_company, prospect_company),
    company_key      = public._sales_company_key(coalesce(v_company, prospect_company)),
    contact_name     = CASE WHEN p ? 'contact_name' THEN NULLIF(trim(coalesce(p ->> 'contact_name', '')), '') ELSE contact_name END,
    contact_email    = CASE WHEN p ? 'contact_email' THEN v_email ELSE contact_email END,
    email_domain     = public._sales_email_domain(CASE WHEN p ? 'contact_email' THEN v_email ELSE contact_email END),
    contact_phone    = CASE WHEN p ? 'contact_phone' THEN NULLIF(trim(coalesce(p ->> 'contact_phone', '')), '') ELSE contact_phone END,
    country          = CASE WHEN p ? 'country' THEN NULLIF(p ->> 'country', '') ELSE country END,
    industry         = CASE WHEN p ? 'industry' THEN NULLIF(p ->> 'industry', '') ELSE industry END,
    need_type        = coalesce(NULLIF(p ->> 'need_type', ''), need_type),
    sap_area         = CASE WHEN p ? 'sap_area' THEN NULLIF(p ->> 'sap_area', '') ELSE sap_area END,
    description      = CASE WHEN p ? 'description' THEN NULLIF(p ->> 'description', '') ELSE description END,
    solution_id      = CASE WHEN p ? 'solution_id' THEN NULLIF(p ->> 'solution_id', '')::uuid ELSE solution_id END,
    est_value        = CASE WHEN p ? 'est_value' THEN NULLIF(p ->> 'est_value', '')::numeric ELSE est_value END,
    currency         = coalesce(NULLIF(p ->> 'currency', ''), currency),
    expected_close   = CASE WHEN p ? 'expected_close' THEN NULLIF(p ->> 'expected_close', '')::date ELSE expected_close END,
    commission_pct   = CASE WHEN o.stage <> 'won' AND p ? 'commission_pct' THEN coalesce(NULLIF(p ->> 'commission_pct', '')::numeric, commission_pct) ELSE commission_pct END,
    commission_payer = CASE WHEN o.stage <> 'won' AND p ? 'commission_payer' THEN coalesce(NULLIF(p ->> 'commission_payer', ''), commission_payer) ELSE commission_payer END
  WHERE id = p_id;
  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.opportunity_set_stage(p_id uuid, p_stage text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o opportunities%ROWTYPE; v_conf jsonb; v_cfg jsonb := public._sales_cfg();
BEGIN
  SELECT * INTO o FROM opportunities WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public._opp_can_edit(o) THEN RAISE EXCEPTION 'Opportunity not found' USING ERRCODE = '42501'; END IF;
  IF p_stage NOT IN ('lead','qualified','proposal','lost') THEN
    RAISE EXCEPTION 'An opportunity is won when the customer accepts its proposal' USING ERRCODE = '22023';
  END IF;
  IF o.stage = 'won' THEN RAISE EXCEPTION 'This opportunity is already won' USING ERRCODE = '22023'; END IF;
  IF p_stage = 'lost' AND coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Add the reason' USING ERRCODE = '22023'; END IF;
  IF o.stage = 'lost' AND p_stage <> 'lost' THEN
    v_conf := public.sales_check_conflict(o.prospect_company, o.contact_email, o.id);
    IF (v_conf ->> 'conflict')::boolean AND NOT public.is_staff() THEN
      RAISE EXCEPTION 'This customer is now registered by another seller until %', v_conf ->> 'until' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE opportunities SET stage = p_stage,
         lost_reason = CASE WHEN p_stage = 'lost' THEN trim(p_reason) ELSE NULL END,
         closed_at = CASE WHEN p_stage = 'lost' THEN now() ELSE NULL END,
         protection_until = CASE WHEN o.stage = 'lost' AND p_stage <> 'lost' AND coalesce((v_cfg ->> 'protection_enabled')::boolean, true)
                                 THEN current_date + coalesce((v_cfg ->> 'protection_days')::int, 90) ELSE protection_until END
   WHERE id = p_id;
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, old_value, new_value)
  VALUES ('sales.stage_changed', auth.uid(), 'opportunity', p_id::text, o.title, jsonb_build_object('stage', o.stage), jsonb_build_object('stage', p_stage, 'reason', p_reason));
END $$;

-- Presale project for the opportunity (proposal work happens there); cases from the solution template.
CREATE OR REPLACE FUNCTION public.opportunity_create_project(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o opportunities%ROWTYPE; v_sol solutions%ROWTYPE; v_proj uuid; v_cust uuid; v_case uuid; t jsonb; v_vis jsonb;
BEGIN
  SELECT * INTO o FROM opportunities WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public._opp_can_edit(o) THEN RAISE EXCEPTION 'Opportunity not found' USING ERRCODE = '42501'; END IF;
  IF o.project_id IS NOT NULL THEN RETURN o.project_id; END IF;
  IF o.stage IN ('won','lost') THEN RAISE EXCEPTION 'The opportunity is closed' USING ERRCODE = '22023'; END IF;

  IF o.partner_id IS NOT NULL THEN
    PERFORM public._partner_must_be_approved(o.partner_id);
    PERFORM public._check_limit(o.partner_id, 'maxProjects',
      (SELECT count(*) FROM projects WHERE partner_id = o.partner_id AND coalesce(status::text, '') NOT IN ('cancelled', 'completed', 'closed', 'archived')),
      'active project(s)');
    SELECT id INTO v_cust FROM customers WHERE partner_id = o.partner_id AND NOT archived
      AND public._sales_company_key(name) = o.company_key ORDER BY created_at LIMIT 1;
    IF v_cust IS NULL THEN
      INSERT INTO customers (partner_id, name, industry, country, contact_name, contact_email, contact_phone, currency)
      VALUES (o.partner_id, o.prospect_company, o.industry, o.country, o.contact_name, o.contact_email, o.contact_phone, o.currency)
      RETURNING id INTO v_cust;
    END IF;
  END IF;

  PERFORM set_config('arena.sales_rpc', 'on', true);
  INSERT INTO projects (name, description, status, partner_id, customer_id, created_by, area_sap, industry, currency,
                        stakeholder_name, stakeholder_email, project_type, total_budget)
  VALUES (o.title, coalesce(o.description, ''), 'draft', o.partner_id, v_cust, o.seller_id, o.sap_area, o.industry, o.currency,
          o.contact_name, o.contact_email, 'presale', o.est_value)
  RETURNING id INTO v_proj;
  PERFORM set_config('arena.sales_rpc', 'off', true);

  -- Cases from the packaged solution: private until the deal is won and delivery is decided.
  IF o.solution_id IS NOT NULL THEN
    SELECT * INTO v_sol FROM solutions WHERE id = o.solution_id;
    SELECT coalesce(value, '{}'::jsonb) INTO v_vis FROM system_settings WHERE key = 'case_visibility';
    v_vis := coalesce(v_vis, '{}'::jsonb);
    FOR t IN SELECT * FROM jsonb_array_elements(coalesce(v_sol.case_templates, '[]'::jsonb)) LOOP
      CONTINUE WHEN coalesce(trim(t ->> 'title'), '') = '';
      INSERT INTO cases (title, description, project_id, created_by, status, is_public, area_sap, case_type, estimated_hours)
      VALUES (trim(t ->> 'title'), t ->> 'description', v_proj, o.seller_id, 'open', false,
              coalesce(NULLIF(t ->> 'area_sap', ''), o.sap_area), NULLIF(t ->> 'case_type', ''), NULLIF(t ->> 'est_hours', '')::numeric)
      RETURNING id INTO v_case;
      v_vis := v_vis || jsonb_build_object(v_case::text, 'private');
    END LOOP;
    INSERT INTO system_settings (key, value) VALUES ('case_visibility', v_vis)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;

  UPDATE opportunities SET project_id = v_proj, stage = CASE WHEN stage = 'lead' THEN 'qualified' ELSE stage END WHERE id = p_id;
  RETURN v_proj;
END $$;

-- ── Seller commission and won deals ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sales_commission_invoice(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k sales_commissions%ROWTYPE; o opportunities%ROWTYPE; v_to uuid; v_inv uuid; v_proj projects%ROWTYPE;
BEGIN
  SELECT * INTO k FROM sales_commissions WHERE id = p_id;
  IF k.invoice_id IS NOT NULL OR coalesce(k.amount, 0) <= 0 OR k.payout_status = 'cancelled' OR k.payer = 'platform' THEN RETURN k.invoice_id; END IF;
  SELECT * INTO o FROM opportunities WHERE id = k.opportunity_id;
  SELECT * INTO v_proj FROM projects WHERE id = o.project_id;
  IF k.payer = 'customer' THEN
    v_to := coalesce(v_proj.client_id, (SELECT client_user_id FROM customers WHERE id = v_proj.customer_id));
  ELSE
    SELECT coalesce((SELECT p.owner_id FROM partners p WHERE p.id = d.partner_id), (SELECT t.created_by FROM consultant_teams t WHERE t.id = d.team_id))
      INTO v_to FROM project_deliveries d WHERE d.opportunity_id = o.id AND d.status = 'awarded' ORDER BY d.decided_at DESC LIMIT 1;
    IF v_to IS NULL THEN RETURN NULL; END IF;     -- invoiced when the delivery is awarded
  END IF;
  INSERT INTO invoices (invoice_number, client_id, amount, status, issue_date, due_date, notes, kind, currency, project_id)
  VALUES ('SLC-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          v_to, round(k.amount, 2), 'sent', current_date, current_date + 30,
          format('Sales commission — "%s" (%s): %s%% of %s %s', o.title, o.prospect_company, k.pct, k.base_amount, k.currency),
          'sales_commission', k.currency, o.project_id)
  RETURNING id INTO v_inv;
  UPDATE sales_commissions SET invoice_id = v_inv, payer_user_id = v_to WHERE id = p_id;
  IF v_to IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (v_to, 'invoice', 'Sales commission invoice', format('Commission for "%s": %s %s.', o.title, round(k.amount, 2), k.currency),
            jsonb_build_object('invoice_id', v_inv, 'project_id', o.project_id), 'invoice');
  END IF;
  RETURN v_inv;
END $$;
REVOKE ALL ON FUNCTION public._sales_commission_invoice(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sales_on_proposal_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o opportunities%ROWTYPE; v_base numeric; v_type text; v_pct numeric; v_amount numeric; v_kid uuid;
BEGIN
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' OR NEW.project_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO o FROM opportunities WHERE project_id = NEW.project_id AND stage NOT IN ('won','lost') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_type := coalesce(NEW.totals ->> 'type', 'cases');
  v_base := CASE
    WHEN v_type = 'plan' THEN coalesce(NULLIF(NEW.accepted_option ->> 'total', '')::numeric, NULLIF(NEW.totals ->> 'total', '')::numeric)
    WHEN v_type = 'on_demand' THEN coalesce(NULLIF(NEW.totals ->> 'minMonthly', '')::numeric, NULLIF(NEW.totals ->> 'total', '')::numeric)
    ELSE NULLIF(NEW.totals ->> 'total', '')::numeric END;
  v_base := coalesce(v_base, 0);
  v_pct := coalesce(o.commission_pct, (SELECT default_commission_pct FROM sellers WHERE user_id = o.seller_id),
                    (public._sales_cfg() ->> 'default_commission_pct')::numeric, 5);
  v_amount := round(v_base * v_pct / 100, 2);

  UPDATE opportunities SET stage = 'won', won_at = now(), closed_at = now(), est_value = coalesce(NULLIF(v_base, 0), est_value) WHERE id = o.id;
  INSERT INTO sales_commissions (opportunity_id, seller_id, seller_partner_id, proposal_id, base_amount, pct, amount, currency, payer)
  VALUES (o.id, o.seller_id, o.partner_id, NEW.id, v_base, v_pct, v_amount, coalesce(NULLIF(NEW.currency, ''), o.currency), o.commission_payer)
  ON CONFLICT (opportunity_id) DO NOTHING
  RETURNING id INTO v_kid;
  IF v_kid IS NOT NULL THEN PERFORM public._sales_commission_invoice(v_kid); END IF;

  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (o.seller_id, 'sales', 'Deal won 🎉',
          format('"%s" accepted the proposal for "%s". Your commission: %s %s (%s%% of %s). Next: choose who delivers it.',
                 o.prospect_company, o.title, v_amount, coalesce(NULLIF(NEW.currency, ''), o.currency), v_pct, v_base),
          jsonb_build_object('opportunity_id', o.id, 'project_id', o.project_id), 'sales');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, new_value)
  VALUES ('sales.opportunity_won', o.seller_id, 'opportunity', o.id::text, o.title, jsonb_build_object('base', v_base, 'pct', v_pct, 'amount', v_amount));
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER sales_on_proposal_accepted AFTER UPDATE OF status ON public.project_proposals
  FOR EACH ROW EXECUTE FUNCTION public.sales_on_proposal_accepted();

-- Opportunity moves to "proposal" when a proposal of its project is sent.
CREATE OR REPLACE FUNCTION public.sales_on_proposal_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' AND NEW.project_id IS NOT NULL THEN
    UPDATE opportunities SET stage = 'proposal' WHERE project_id = NEW.project_id AND stage IN ('lead','qualified');
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER sales_on_proposal_sent AFTER UPDATE OF status ON public.project_proposals
  FOR EACH ROW EXECUTE FUNCTION public.sales_on_proposal_sent();

-- ── Delivery handoff ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._delivery_awarded(p_delivery uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d project_deliveries%ROWTYPE; o opportunities%ROWTYPE; v_kid uuid; v_who text; r record;
BEGIN
  SELECT * INTO d FROM project_deliveries WHERE id = p_delivery;
  SELECT * INTO o FROM opportunities WHERE id = d.opportunity_id;
  UPDATE project_deliveries SET status = 'not_selected', decided_at = now()
   WHERE opportunity_id = d.opportunity_id AND id <> d.id AND status IN ('requested','submitted');
  UPDATE opportunities SET delivery_status = 'assigned' WHERE id = o.id;
  SELECT id INTO v_kid FROM sales_commissions WHERE opportunity_id = o.id;
  IF v_kid IS NOT NULL THEN PERFORM public._sales_commission_invoice(v_kid); END IF;
  v_who := coalesce((SELECT name FROM partners WHERE id = d.partner_id), (SELECT name FROM consultant_teams WHERE id = d.team_id), 'the delivery team');
  -- Notify the delivery side (partner owner/admins or the team owner) and the seller.
  FOR r IN SELECT m.user_id FROM partner_members m WHERE d.partner_id IS NOT NULL AND m.partner_id = d.partner_id AND m.role IN ('owner','admin')
           UNION SELECT m.user_id FROM consultant_team_members m WHERE d.team_id IS NOT NULL AND m.team_id = d.team_id AND m.role = 'owner' LOOP
    CONTINUE WHEN r.user_id = o.seller_id;
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (r.user_id, 'sales', 'Project to deliver', format('%s will deliver "%s". The project is now in your Projects.', v_who, o.title),
            jsonb_build_object('project_id', o.project_id, 'opportunity_id', o.id), 'sales');
  END LOOP;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (o.seller_id, 'sales', 'Delivery assigned', format('%s will deliver "%s".', v_who, o.title),
          jsonb_build_object('project_id', o.project_id, 'opportunity_id', o.id), 'sales');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, entity_name, new_value)
  VALUES ('sales.delivery_awarded', auth.uid(), 'opportunity', o.id::text, o.title,
          jsonb_build_object('delivery_id', d.id, 'partner_id', d.partner_id, 'team_id', d.team_id, 'mode', d.mode));
END $$;
REVOKE ALL ON FUNCTION public._delivery_awarded(uuid) FROM public, anon, authenticated;

-- Seller decides who delivers: own (partner or one of their teams), a named partner, open bidding, or the Arena.
CREATE OR REPLACE FUNCTION public.delivery_choose(p_opportunity uuid, p_mode text, p_partner uuid DEFAULT NULL, p_team uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o opportunities%ROWTYPE; v_id uuid; v_vis jsonb; c record; r record;
BEGIN
  SELECT * INTO o FROM opportunities WHERE id = p_opportunity FOR UPDATE;
  IF NOT FOUND OR NOT public._opp_can_edit(o) THEN RAISE EXCEPTION 'Opportunity not found' USING ERRCODE = '42501'; END IF;
  IF o.stage <> 'won' THEN RAISE EXCEPTION 'Choose the delivery once the customer accepts the proposal' USING ERRCODE = '22023'; END IF;
  IF o.project_id IS NULL THEN RAISE EXCEPTION 'The opportunity has no project' USING ERRCODE = '22023'; END IF;
  IF o.delivery_status = 'assigned' THEN RAISE EXCEPTION 'The delivery is already assigned' USING ERRCODE = '22023'; END IF;
  IF p_mode NOT IN ('own','partner','open','arena') THEN RAISE EXCEPTION 'Invalid delivery option' USING ERRCODE = '22023'; END IF;

  -- Switching option: close open requests of the previous one.
  UPDATE project_deliveries SET status = 'withdrawn', decided_at = now()
   WHERE opportunity_id = o.id AND status = 'requested' AND mode = 'request' AND p_mode <> 'partner';

  IF p_mode = 'own' THEN
    IF p_team IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM consultant_team_members m WHERE m.team_id = p_team AND m.user_id = o.seller_id AND (m.role = 'owner' OR m.status = 'accepted')) THEN
        RAISE EXCEPTION 'You are not a member of this team' USING ERRCODE = '42501';
      END IF;
    ELSIF coalesce(p_partner, o.partner_id) IS NULL THEN
      RAISE EXCEPTION 'Choose one of your teams' USING ERRCODE = '22023';
    ELSIF public._partner_role(coalesce(p_partner, o.partner_id), o.seller_id) IS NULL THEN
      RAISE EXCEPTION 'You are not a member of this partner' USING ERRCODE = '42501';
    END IF;
    INSERT INTO project_deliveries (opportunity_id, project_id, mode, partner_id, team_id, submitted_by, note, status, decided_at)
    VALUES (o.id, o.project_id, 'own', CASE WHEN p_team IS NULL THEN coalesce(p_partner, o.partner_id) END, p_team, auth.uid(), p_note, 'awarded', now())
    RETURNING id INTO v_id;
    UPDATE opportunities SET delivery_mode = 'own' WHERE id = o.id;
    PERFORM public._delivery_awarded(v_id);

  ELSIF p_mode = 'partner' THEN
    IF p_partner IS NULL OR NOT EXISTS (SELECT 1 FROM partners WHERE id = p_partner AND status = 'approved') THEN
      RAISE EXCEPTION 'Choose an approved partner' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM project_deliveries WHERE opportunity_id = o.id AND partner_id = p_partner AND status = 'requested') THEN
      RAISE EXCEPTION 'This partner already has your request' USING ERRCODE = '22023';
    END IF;
    INSERT INTO project_deliveries (opportunity_id, project_id, mode, partner_id, submitted_by, note, status)
    VALUES (o.id, o.project_id, 'request', p_partner, auth.uid(), p_note, 'requested') RETURNING id INTO v_id;
    UPDATE opportunities SET delivery_mode = 'partner', delivery_status = 'pending' WHERE id = o.id;
    FOR r IN SELECT m.user_id FROM partner_members m WHERE m.partner_id = p_partner AND m.role IN ('owner','admin') LOOP
      INSERT INTO notifications (user_id, type, title, body, payload, event_type)
      VALUES (r.user_id, 'sales', 'Delivery request', format('You are asked to deliver "%s" (%s). Answer in Partner → Deliveries.', o.title, coalesce(o.sap_area, o.need_type)),
              jsonb_build_object('delivery_id', v_id), 'sales');
    END LOOP;

  ELSIF p_mode = 'open' THEN
    UPDATE opportunities SET delivery_mode = 'open', delivery_status = 'pending' WHERE id = o.id;

  ELSE  -- arena: each case is published for consultants / teams to apply
    SELECT coalesce(value, '{}'::jsonb) INTO v_vis FROM system_settings WHERE key = 'case_visibility';
    v_vis := coalesce(v_vis, '{}'::jsonb);
    FOR c IN SELECT id FROM cases WHERE project_id = o.project_id LOOP
      v_vis := v_vis || jsonb_build_object(c.id::text, 'public');
    END LOOP;
    INSERT INTO system_settings (key, value) VALUES ('case_visibility', v_vis) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    UPDATE cases SET is_public = true WHERE project_id = o.project_id;
    UPDATE opportunities SET delivery_mode = 'arena', delivery_status = 'assigned' WHERE id = o.id;
  END IF;
  RETURN v_id;
END $$;

-- Partner answers a named delivery request.
CREATE OR REPLACE FUNCTION public.delivery_respond(p_delivery uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d project_deliveries%ROWTYPE; o opportunities%ROWTYPE;
BEGIN
  SELECT * INTO d FROM project_deliveries WHERE id = p_delivery FOR UPDATE;
  IF NOT FOUND OR d.status <> 'requested' THEN RAISE EXCEPTION 'Request not found or already answered' USING ERRCODE = '22023'; END IF;
  IF NOT (public.is_staff() OR public._can_act_for_delivery(d.partner_id, d.team_id)) THEN RAISE EXCEPTION 'Only the partner''s owner or admins' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM opportunities WHERE id = d.opportunity_id FOR UPDATE;
  IF o.delivery_status = 'assigned' THEN RAISE EXCEPTION 'The delivery is already assigned' USING ERRCODE = '22023'; END IF;
  UPDATE project_deliveries SET status = CASE WHEN p_accept THEN 'awarded' ELSE 'declined' END, decided_at = now(),
         submitted_by = auth.uid(), note = coalesce(NULLIF(trim(coalesce(p_note, '')), ''), note) WHERE id = d.id;
  IF p_accept THEN
    PERFORM public._delivery_awarded(d.id);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM project_deliveries WHERE opportunity_id = o.id AND status IN ('requested','submitted')) THEN
      UPDATE opportunities SET delivery_status = 'none' WHERE id = o.id;
    END IF;
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (o.seller_id, 'sales', 'Delivery request declined',
            format('%s declined "%s".%s', (SELECT name FROM partners WHERE id = d.partner_id), o.title, coalesce(' ' || NULLIF(trim(coalesce(p_note, '')), ''), '')),
            jsonb_build_object('opportunity_id', o.id), 'sales');
  END IF;
END $$;

-- Partner (owner/admin) or team owner bids to deliver an open project.
CREATE OR REPLACE FUNCTION public.delivery_bid(p_opportunity uuid, p_partner uuid, p_team uuid, p_price numeric, p_currency text,
                                               p_start date, p_team_summary text, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o opportunities%ROWTYPE; v_id uuid;
BEGIN
  IF (p_partner IS NULL) = (p_team IS NULL) THEN RAISE EXCEPTION 'Bid as a partner or as a team' USING ERRCODE = '22023'; END IF;
  IF NOT public._can_act_for_delivery(p_partner, p_team) THEN RAISE EXCEPTION 'Only partner owners/admins or team owners can bid' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM opportunities WHERE id = p_opportunity;
  IF NOT FOUND OR o.delivery_mode <> 'open' OR o.delivery_status <> 'pending' THEN RAISE EXCEPTION 'This project is not open for bids' USING ERRCODE = '22023'; END IF;
  IF o.seller_id = auth.uid() THEN RAISE EXCEPTION 'You cannot bid on your own deal — choose "Own team" instead' USING ERRCODE = '22023'; END IF;
  IF p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'Enter your price' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_id FROM project_deliveries WHERE opportunity_id = o.id AND status = 'submitted'
     AND partner_id IS NOT DISTINCT FROM p_partner AND team_id IS NOT DISTINCT FROM p_team;
  IF v_id IS NULL THEN
    INSERT INTO project_deliveries (opportunity_id, project_id, mode, partner_id, team_id, submitted_by, price, currency, start_date, team_summary, note, status)
    VALUES (o.id, o.project_id, 'bid', p_partner, p_team, auth.uid(), p_price, coalesce(NULLIF(p_currency, ''), o.currency), p_start,
            NULLIF(trim(coalesce(p_team_summary, '')), ''), NULLIF(trim(coalesce(p_note, '')), ''), 'submitted')
    RETURNING id INTO v_id;
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (o.seller_id, 'sales', 'New delivery bid',
            format('%s bid %s %s to deliver "%s".', coalesce((SELECT name FROM partners WHERE id = p_partner), (SELECT name FROM consultant_teams WHERE id = p_team)),
                   p_price, coalesce(NULLIF(p_currency, ''), o.currency), o.title),
            jsonb_build_object('opportunity_id', o.id), 'sales');
  ELSE
    UPDATE project_deliveries SET price = p_price, currency = coalesce(NULLIF(p_currency, ''), o.currency), start_date = p_start,
           team_summary = NULLIF(trim(coalesce(p_team_summary, '')), ''), note = NULLIF(trim(coalesce(p_note, '')), ''), submitted_by = auth.uid()
     WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.delivery_withdraw(p_delivery uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d project_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO d FROM project_deliveries WHERE id = p_delivery FOR UPDATE;
  IF NOT FOUND OR d.status <> 'submitted' OR NOT public._can_act_for_delivery(d.partner_id, d.team_id) THEN
    RAISE EXCEPTION 'Bid not found' USING ERRCODE = '22023';
  END IF;
  UPDATE project_deliveries SET status = 'withdrawn', decided_at = now() WHERE id = d.id;
END $$;

-- Seller (or staff) awards an open bid.
CREATE OR REPLACE FUNCTION public.delivery_award(p_delivery uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d project_deliveries%ROWTYPE; o opportunities%ROWTYPE; r record;
BEGIN
  SELECT * INTO d FROM project_deliveries WHERE id = p_delivery FOR UPDATE;
  IF NOT FOUND OR d.status <> 'submitted' THEN RAISE EXCEPTION 'Bid not found' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM opportunities WHERE id = d.opportunity_id FOR UPDATE;
  IF NOT public._opp_can_edit(o) THEN RAISE EXCEPTION 'Only the seller' USING ERRCODE = '42501'; END IF;
  IF o.delivery_status = 'assigned' THEN RAISE EXCEPTION 'The delivery is already assigned' USING ERRCODE = '22023'; END IF;
  -- Tell the bidders who were not selected.
  FOR r IN SELECT x.submitted_by FROM project_deliveries x WHERE x.opportunity_id = o.id AND x.id <> d.id AND x.status = 'submitted' AND x.submitted_by IS NOT NULL LOOP
    INSERT INTO notifications (user_id, type, title, body, payload, event_type)
    VALUES (r.submitted_by, 'sales', 'Bid not selected', format('Another bid was chosen to deliver "%s". Thank you for bidding.', o.title), '{}'::jsonb, 'sales');
  END LOOP;
  UPDATE project_deliveries SET status = 'awarded', decided_at = now() WHERE id = d.id;
  PERFORM public._delivery_awarded(d.id);
END $$;

-- Open projects to bid on (customer name hidden), for partner owners/admins and team owners.
CREATE OR REPLACE FUNCTION public.delivery_open_tenders()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'opportunity_id', o.id, 'title', o.title, 'description', o.description, 'need_type', o.need_type, 'sap_area', o.sap_area,
    'industry', o.industry, 'country', o.country, 'currency', o.currency, 'won_at', o.won_at,
    'solution', (SELECT s.title FROM solutions s WHERE s.id = o.solution_id),
    'cases', (SELECT coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'area_sap', c.area_sap, 'estimated_hours', c.estimated_hours) ORDER BY c.created_at), '[]'::jsonb)
              FROM cases c WHERE c.project_id = o.project_id),
    'bids', (SELECT count(*) FROM project_deliveries d WHERE d.opportunity_id = o.id AND d.status = 'submitted'),
    'my_bids', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'partner_id', d.partner_id, 'team_id', d.team_id, 'price', d.price,
                         'currency', d.currency, 'start_date', d.start_date, 'team_summary', d.team_summary, 'note', d.note, 'status', d.status)), '[]'::jsonb)
                FROM project_deliveries d WHERE d.opportunity_id = o.id AND public._can_act_for_delivery(d.partner_id, d.team_id))
  ) ORDER BY o.won_at DESC), '[]'::jsonb)
  FROM opportunities o
  WHERE o.delivery_mode = 'open' AND o.delivery_status = 'pending' AND o.seller_id <> auth.uid()
    AND (EXISTS (SELECT 1 FROM partner_members m JOIN partners p ON p.id = m.partner_id
                 WHERE m.user_id = auth.uid() AND m.role IN ('owner','admin') AND p.status = 'approved')
         OR EXISTS (SELECT 1 FROM consultant_team_members m WHERE m.user_id = auth.uid() AND m.role = 'owner'));
$$;

-- Named requests to my partners.
CREATE OR REPLACE FUNCTION public.delivery_requests_for_me()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'status', d.status, 'note', d.note, 'created_at', d.created_at, 'decided_at', d.decided_at,
    'partner_id', d.partner_id, 'partner_name', p.name, 'project_id', d.project_id,
    'opportunity', jsonb_build_object('title', o.title, 'company', o.prospect_company, 'description', o.description,
                   'need_type', o.need_type, 'sap_area', o.sap_area, 'country', o.country, 'industry', o.industry, 'currency', o.currency,
                   'seller', (SELECT full_name FROM users WHERE id = o.seller_id)),
    'cases', (SELECT coalesce(jsonb_agg(jsonb_build_object('title', c.title, 'estimated_hours', c.estimated_hours)), '[]'::jsonb) FROM cases c WHERE c.project_id = o.project_id)
  ) ORDER BY d.created_at DESC), '[]'::jsonb)
  FROM project_deliveries d JOIN opportunities o ON o.id = d.opportunity_id JOIN partners p ON p.id = d.partner_id
  WHERE d.mode = 'request' AND public._can_act_for_delivery(d.partner_id, NULL);
$$;

-- Seller pipeline (own opportunities; staff: all) with project, deliveries and commission.
CREATE OR REPLACE FUNCTION public.opportunities_list(p_all boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
    'seller_name', (SELECT full_name FROM users WHERE id = o.seller_id),
    'partner_name', (SELECT name FROM partners WHERE id = o.partner_id),
    'solution', (SELECT jsonb_build_object('id', s.id, 'title', s.title) FROM solutions s WHERE s.id = o.solution_id),
    'project', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status) FROM projects p WHERE p.id = o.project_id),
    'proposals', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'version', x.version, 'status', x.status,
                    'total', x.totals ->> 'total', 'currency', x.currency) ORDER BY x.created_at DESC), '[]'::jsonb)
                  FROM project_proposals x WHERE o.project_id IS NOT NULL AND x.project_id = o.project_id),
    'deliveries', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'mode', d.mode, 'status', d.status, 'price', d.price, 'currency', d.currency,
                    'start_date', d.start_date, 'team_summary', d.team_summary, 'note', d.note, 'created_at', d.created_at,
                    'partner_id', d.partner_id, 'partner_name', (SELECT name FROM partners WHERE id = d.partner_id),
                    'team_id', d.team_id, 'team_name', (SELECT name FROM consultant_teams WHERE id = d.team_id)) ORDER BY d.created_at DESC), '[]'::jsonb)
                   FROM project_deliveries d WHERE d.opportunity_id = o.id),
    'commission', (SELECT jsonb_build_object('id', k.id, 'amount', k.amount, 'pct', k.pct, 'base_amount', k.base_amount, 'currency', k.currency,
                     'payer', k.payer, 'payout_status', k.payout_status, 'paid_at', k.paid_at) FROM sales_commissions k WHERE k.opportunity_id = o.id)
  ) ORDER BY o.updated_at DESC), '[]'::jsonb)
  FROM opportunities o
  WHERE o.seller_id = auth.uid()
     OR (p_all AND public.is_staff())
     OR (p_all AND o.partner_id IS NOT NULL AND public.is_partner_member(o.partner_id, ARRAY['owner','admin']));
$$;

-- Partners a seller can ask to deliver.
CREATE OR REPLACE FUNCTION public.delivery_partner_directory()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'country', p.country, 'website', p.website,
           'solutions', (SELECT count(*) FROM solutions s WHERE s.partner_id = p.id AND s.status = 'published')) ORDER BY p.name), '[]'::jsonb)
  FROM partners p WHERE p.status = 'approved' AND public.is_approved_seller();
$$;

-- Published solutions with the owner partner's name.
CREATE OR REPLACE FUNCTION public.solutions_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('partner_name', p.name) ORDER BY s.title), '[]'::jsonb)
  FROM solutions s LEFT JOIN partners p ON p.id = s.partner_id
  WHERE s.status = 'published' OR public.is_staff() OR (s.partner_id IS NOT NULL AND public.is_partner_member(s.partner_id));
$$;

-- ── Seller commission admin ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_commission_set_amount(p_id uuid, p_amount numeric, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k sales_commissions%ROWTYPE; v_inv_status text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM sales_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR k.payout_status <> 'pending' THEN RAISE EXCEPTION 'Only pending commissions can be changed' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Enter a valid amount' USING ERRCODE = '22023'; END IF;
  IF k.invoice_id IS NOT NULL THEN
    SELECT status INTO v_inv_status FROM invoices WHERE id = k.invoice_id;
    IF v_inv_status = 'paid' THEN RAISE EXCEPTION 'The commission invoice is already paid' USING ERRCODE = '22023'; END IF;
    UPDATE invoices SET amount = round(p_amount, 2), notes = notes || ' — adjusted' WHERE id = k.invoice_id;
  END IF;
  UPDATE sales_commissions SET amount = round(p_amount, 2), note = coalesce(NULLIF(trim(coalesce(p_note, '')), ''), note) WHERE id = p_id;
  PERFORM public._sales_commission_invoice(p_id);
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, old_value, new_value)
  VALUES ('sales.commission_adjusted', auth.uid(), 'opportunity', k.opportunity_id::text, jsonb_build_object('amount', k.amount), jsonb_build_object('amount', p_amount));
END $$;

CREATE OR REPLACE FUNCTION public.sales_commission_record_payment(p_id uuid, p_paid_at date DEFAULT current_date, p_ref text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k sales_commissions%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM sales_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR k.payout_status <> 'pending' THEN RAISE EXCEPTION 'Commission not found or not pending' USING ERRCODE = '22023'; END IF;
  UPDATE sales_commissions SET payout_status = 'paid', paid_at = coalesce(p_paid_at, current_date), paid_by = auth.uid(),
         payment_ref = NULLIF(trim(coalesce(p_ref, '')), ''), note = coalesce(NULLIF(trim(coalesce(p_note, '')), ''), note) WHERE id = p_id;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (k.seller_id, 'sales', 'Commission paid',
          format('Your sales commission of %s %s was paid%s.', k.amount, k.currency, coalesce(' (ref. ' || NULLIF(trim(coalesce(p_ref, '')), '') || ')', '')),
          jsonb_build_object('commission_id', p_id), 'sales');
  INSERT INTO audit_logs (event_type, user_id, entity_type, entity_id, new_value)
  VALUES ('sales.commission_paid', auth.uid(), 'opportunity', k.opportunity_id::text, jsonb_build_object('amount', k.amount, 'ref', p_ref));
END $$;

CREATE OR REPLACE FUNCTION public.sales_commission_cancel(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k sales_commissions%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators and managers' USING ERRCODE = '42501'; END IF;
  SELECT * INTO k FROM sales_commissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR k.payout_status <> 'pending' THEN RAISE EXCEPTION 'Commission not found or not pending' USING ERRCODE = '22023'; END IF;
  IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Add a reason' USING ERRCODE = '22023'; END IF;
  UPDATE sales_commissions SET payout_status = 'cancelled', note = trim(p_note) WHERE id = p_id;
  INSERT INTO notifications (user_id, type, title, body, payload, event_type)
  VALUES (k.seller_id, 'sales', 'Commission cancelled', 'Reason: ' || trim(p_note), jsonb_build_object('commission_id', p_id), 'sales');
END $$;

CREATE OR REPLACE FUNCTION public.sales_commissions_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'amount', k.amount, 'currency', k.currency, 'pct', k.pct, 'base_amount', k.base_amount, 'payer', k.payer,
    'payout_status', k.payout_status, 'paid_at', k.paid_at, 'payment_ref', k.payment_ref, 'note', k.note, 'created_at', k.created_at,
    'opportunity', jsonb_build_object('id', o.id, 'title', o.title, 'company', o.prospect_company),
    'seller', jsonb_build_object('id', u.id, 'full_name', u.full_name),
    'invoice', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('id', i.id, 'number', i.invoice_number, 'status', i.status, 'due_date', i.due_date) END
  ) ORDER BY k.created_at DESC), '[]'::jsonb)
  FROM sales_commissions k JOIN opportunities o ON o.id = k.opportunity_id JOIN users u ON u.id = k.seller_id
  LEFT JOIN invoices i ON i.id = k.invoice_id
  WHERE public.is_staff() OR k.seller_id = auth.uid();
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'seller_request(text, text)', 'seller_review(uuid, text, text)', 'partner_set_seller(uuid, uuid, boolean)', 'my_seller()',
    'sellers_list()', 'seller_set_commission(uuid, numeric)', 'sales_check_conflict(text, text, uuid)',
    'opportunity_save(uuid, jsonb)', 'opportunity_set_stage(uuid, text, text)', 'opportunity_create_project(uuid)',
    'delivery_choose(uuid, text, uuid, uuid, text)', 'delivery_respond(uuid, boolean, text)',
    'delivery_bid(uuid, uuid, uuid, numeric, text, date, text, text)', 'delivery_withdraw(uuid)', 'delivery_award(uuid)',
    'delivery_open_tenders()', 'delivery_requests_for_me()', 'opportunities_list(boolean)', 'delivery_partner_directory()',
    'solutions_catalog()', 'sales_commission_set_amount(uuid, numeric, text)', 'sales_commission_record_payment(uuid, date, text, text)',
    'sales_commission_cancel(uuid, text)', 'sales_commissions_list()',
    'is_approved_seller(uuid)', 'is_project_seller(uuid)', 'is_project_delivery_member(uuid, boolean)', '_can_act_for_delivery(uuid, uuid)',
    '_opp_can_edit(opportunities)', '_sales_cfg()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.solutions TO authenticated;
GRANT SELECT ON public.sellers, public.opportunities, public.project_deliveries, public.sales_commissions TO authenticated;
