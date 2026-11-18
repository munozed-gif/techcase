-- Partners → Customers → Projects (phases 1, 3, 4, 5 — database side)
--
-- Partner: the account that runs its own projects (a freelance consultant, a consulting firm,
-- or a company managing its own SAP work). Has a plan (free / pro) and needs admin approval.
-- Customer: a partner's customer; owns SAP systems, VPN profiles and validation overrides.
-- Projects and cases carry partner_id / customer_id. The old client_id stays (history and the
-- existing client-user access); migrated customers keep the client user's id as their id, so
-- every setting keyed by that id (SAP setup, validations) keeps working.
-- Plan limits (plan_config.partner in system_settings, defaults below) are checked here, in
-- the database. Nothing is dropped or deleted.

-- ── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  kind                   text NOT NULL DEFAULT 'firm' CHECK (kind IN ('individual', 'firm', 'direct')),
  logo_url               text,
  website                text,
  country                text,
  owner_id               uuid NOT NULL REFERENCES auth.users(id),
  plan                   text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  request_note           text,
  review_note            text,
  approved_at            timestamptz,
  approved_by            uuid,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_updated_at        timestamptz,
  legacy_client_id       uuid UNIQUE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_members (
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid NOT NULL REFERENCES public.partners(id),
  name           text NOT NULL,
  industry       text,
  website        text,
  logo_url       text,
  country        text,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  notes          text,
  client_user_id uuid REFERENCES auth.users(id),
  archived       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_partner_idx ON public.customers (partner_id);
CREATE INDEX IF NOT EXISTS customers_client_user_idx ON public.customers (client_user_id);

CREATE TABLE IF NOT EXISTS public.customer_members (
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  role        text NOT NULL DEFAULT 'key_user' CHECK (role IN ('admin', 'project_manager', 'key_user', 'final_user', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.customer_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'key_user' CHECK (role IN ('admin', 'project_manager', 'key_user', 'final_user', 'viewer')),
  invited_by  uuid,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
CREATE INDEX IF NOT EXISTS customer_invites_email_idx ON public.customer_invites (lower(email));

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS partner_id  uuid REFERENCES public.partners(id);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS partner_id  uuid REFERENCES public.partners(id);
ALTER TABLE public.cases    ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
CREATE INDEX IF NOT EXISTS projects_partner_idx  ON public.projects (partner_id);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON public.projects (customer_id);
CREATE INDEX IF NOT EXISTS cases_partner_idx     ON public.cases (partner_id);
CREATE INDEX IF NOT EXISTS cases_customer_idx    ON public.cases (customer_id);

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(get_my_role(), '') IN ('admin', 'manager');
$$;

-- Role of user u in partner p ('owner' | 'admin' | 'member' | NULL).
CREATE OR REPLACE FUNCTION public._partner_role(p uuid, u uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM partner_members m WHERE m.partner_id = p AND m.user_id = u LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_partner_member(p uuid, roles text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM partner_members m WHERE m.partner_id = p AND m.user_id = auth.uid()
      AND (roles IS NULL OR m.role = ANY (roles)));
$$;

CREATE OR REPLACE FUNCTION public._customer_member(c uuid, u uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c IS NOT NULL AND EXISTS (
    SELECT 1 FROM customer_members m WHERE m.customer_id = c AND m.user_id = u
    UNION ALL SELECT 1 FROM customers x WHERE x.id = c AND x.client_user_id = u);
$$;

CREATE OR REPLACE FUNCTION public.is_customer_member(c uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public._customer_member(c, auth.uid());
$$;

-- Plan limits of a partner: plan_config.partner.<plan> over the defaults.
CREATE OR REPLACE FUNCTION public.partner_limits(p uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_cfg jsonb; v_def jsonb;
BEGIN
  SELECT plan INTO v_plan FROM partners WHERE id = p;
  v_plan := coalesce(v_plan, 'free');
  v_def := CASE WHEN v_plan = 'pro'
    THEN '{"maxCustomers":-1,"maxProjects":-1,"maxOpenCases":-1,"maxMembers":5,"maxSapEnvs":-1,"projectVpn":true,"sapImplementation":true,"validations":true}'::jsonb
    ELSE '{"maxCustomers":1,"maxProjects":1,"maxOpenCases":3,"maxMembers":1,"maxSapEnvs":1,"projectVpn":false,"sapImplementation":false,"validations":false}'::jsonb END;
  SELECT value -> 'partner' -> v_plan INTO v_cfg FROM system_settings WHERE key = 'plan_config';
  RETURN v_def || CASE WHEN jsonb_typeof(v_cfg) = 'object' THEN v_cfg ELSE '{}'::jsonb END || jsonb_build_object('plan', v_plan);
END $$;

-- Partner of a sap_integration / validation scope key: a customer id, proj_<project id>,
-- or a migrated client user id (= customer id).
CREATE OR REPLACE FUNCTION public.partner_for_scope(p_scope text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_scope ~ UUID_RE THEN
    SELECT partner_id INTO v FROM customers WHERE id = p_scope::uuid;
    IF v IS NULL THEN SELECT id INTO v FROM partners WHERE id = p_scope::uuid; END IF;
  ELSIF p_scope LIKE 'proj\_%' AND substr(p_scope, 6) ~ UUID_RE THEN
    SELECT partner_id INTO v FROM projects WHERE id = substr(p_scope, 6)::uuid;
  END IF;
  RETURN v;
END $$;

-- ── Access: partner / customer members see their projects and cases ────────
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
               OR public.is_customer_member(c.customer_id))
      );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('admin', 'manager', 'project_manager', 'dispatch')
      OR public.user_owns_project(p_project) OR public.user_involved_in_project_cases(p_project)
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project
                 AND (public.is_partner_member(p.partner_id) OR public.is_customer_member(p.customer_id)));
$$;

-- Bridge / server side (explicit user): may user u use the SAP systems of this scope?
CREATE OR REPLACE FUNCTION public._user_can_use_sap_scope(p_user uuid, p_scope text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text; v_id uuid; v_partner uuid;
  UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  SELECT role::text INTO v_role FROM users WHERE id = p_user AND verification_status = 'approved';
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role IN ('admin', 'manager', 'project_manager') THEN RETURN true; END IF;
  v_partner := public.partner_for_scope(p_scope);
  IF v_partner IS NOT NULL AND public._partner_role(v_partner, p_user) IS NOT NULL THEN RETURN true; END IF;
  IF p_scope ~ UUID_RE THEN
    v_id := p_scope::uuid;
    RETURN v_id = p_user OR public._customer_member(v_id, p_user)
        OR EXISTS (SELECT 1 FROM cases c WHERE c.client_id = v_id AND public._user_on_case(p_user, c.id))
        OR EXISTS (SELECT 1 FROM cases c WHERE c.customer_id = v_id AND public._user_on_case(p_user, c.id))
        OR EXISTS (SELECT 1 FROM projects p WHERE p.client_id = v_id AND p.created_by = p_user);
  ELSIF p_scope LIKE 'proj\_%' AND substr(p_scope, 6) ~ UUID_RE THEN
    v_id := substr(p_scope, 6)::uuid;
    RETURN EXISTS (SELECT 1 FROM projects p WHERE p.id = v_id
                   AND (p.created_by = p_user OR p.client_id = p_user OR public._customer_member(p.customer_id, p_user)))
        OR EXISTS (SELECT 1 FROM cases c WHERE c.project_id = v_id AND public._user_on_case(p_user, c.id));
  END IF;
  RETURN false;
END $$;

-- May the current user manage the SAP setup / VPN profiles / validations of this scope?
CREATE OR REPLACE FUNCTION public._can_manage_sap_scope(p_scope text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE UUID_RE constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RETURN false; END IF;
  RETURN public.is_staff()
      OR p_scope = auth.uid()::text
      OR public.is_partner_member(public.partner_for_scope(p_scope), ARRAY['owner', 'admin'])
      OR (p_scope LIKE 'proj\_%' AND substr(p_scope, 6) ~ UUID_RE AND public.user_owns_project(substr(p_scope, 6)::uuid));
END $$;

-- ── Row level security ─────────────────────────────────────────────────────
ALTER TABLE public.partners         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partners, public.partner_members, public.customers, public.customer_members, public.customer_invites FROM anon;

CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(p_table text, p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_name) THEN
    EXECUTE p_sql;
  END IF;
END $$;

SELECT pg_temp.ensure_policy('partners', 'partners_read',
  $p$CREATE POLICY partners_read ON public.partners FOR SELECT TO authenticated
     USING (public.is_staff() OR owner_id = auth.uid() OR public.is_partner_member(id)
            OR EXISTS (SELECT 1 FROM customers c WHERE c.partner_id = partners.id AND public.is_customer_member(c.id)))$p$);
SELECT pg_temp.ensure_policy('partners', 'partners_write',
  $p$CREATE POLICY partners_write ON public.partners FOR UPDATE TO authenticated
     USING (public.is_staff() OR public.is_partner_member(id, ARRAY['owner', 'admin']))
     WITH CHECK (public.is_staff() OR public.is_partner_member(id, ARRAY['owner', 'admin']))$p$);
SELECT pg_temp.ensure_policy('partners', 'partners_staff_all',
  $p$CREATE POLICY partners_staff_all ON public.partners FOR ALL TO authenticated
     USING (public.is_staff()) WITH CHECK (public.is_staff())$p$);

SELECT pg_temp.ensure_policy('partner_members', 'partner_members_read',
  $p$CREATE POLICY partner_members_read ON public.partner_members FOR SELECT TO authenticated
     USING (public.is_staff() OR user_id = auth.uid() OR public.is_partner_member(partner_id))$p$);
SELECT pg_temp.ensure_policy('partner_members', 'partner_members_write',
  $p$CREATE POLICY partner_members_write ON public.partner_members FOR ALL TO authenticated
     USING (public.is_staff() OR public.is_partner_member(partner_id, ARRAY['owner', 'admin']))
     WITH CHECK (public.is_staff() OR public.is_partner_member(partner_id, ARRAY['owner', 'admin']))$p$);

SELECT pg_temp.ensure_policy('customers', 'customers_read',
  $p$CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
     USING (public.is_staff() OR public.is_partner_member(partner_id) OR public.is_customer_member(id))$p$);
SELECT pg_temp.ensure_policy('customers', 'customers_write',
  $p$CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated
     USING (public.is_staff() OR public.is_partner_member(partner_id, ARRAY['owner', 'admin']))
     WITH CHECK (public.is_staff() OR public.is_partner_member(partner_id, ARRAY['owner', 'admin']))$p$);

SELECT pg_temp.ensure_policy('customer_members', 'customer_members_read',
  $p$CREATE POLICY customer_members_read ON public.customer_members FOR SELECT TO authenticated
     USING (public.is_staff() OR user_id = auth.uid()
            OR EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND public.is_partner_member(c.partner_id)))$p$);
SELECT pg_temp.ensure_policy('customer_members', 'customer_members_write',
  $p$CREATE POLICY customer_members_write ON public.customer_members FOR ALL TO authenticated
     USING (public.is_staff() OR EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND public.is_partner_member(c.partner_id, ARRAY['owner', 'admin'])))
     WITH CHECK (public.is_staff() OR EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND public.is_partner_member(c.partner_id, ARRAY['owner', 'admin'])))$p$);

SELECT pg_temp.ensure_policy('customer_invites', 'customer_invites_all',
  $p$CREATE POLICY customer_invites_all ON public.customer_invites FOR ALL TO authenticated
     USING (public.is_staff() OR EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND public.is_partner_member(c.partner_id, ARRAY['owner', 'admin'])))
     WITH CHECK (public.is_staff() OR EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND public.is_partner_member(c.partner_id, ARRAY['owner', 'admin'])))$p$);

-- Projects / cases: partner members and customer members.
SELECT pg_temp.ensure_policy('projects', 'projects_partner_read',
  $p$CREATE POLICY projects_partner_read ON public.projects FOR SELECT TO authenticated
     USING (public.is_partner_member(partner_id) OR public.is_customer_member(customer_id))$p$);
SELECT pg_temp.ensure_policy('projects', 'projects_partner_update',
  $p$CREATE POLICY projects_partner_update ON public.projects FOR UPDATE TO authenticated
     USING (public.is_partner_member(partner_id, ARRAY['owner', 'admin']))
     WITH CHECK (public.is_partner_member(partner_id, ARRAY['owner', 'admin']))$p$);
SELECT pg_temp.ensure_policy('cases', 'cases_partner_read',
  $p$CREATE POLICY cases_partner_read ON public.cases FOR SELECT TO authenticated
     USING (public.is_partner_member(partner_id) OR public.is_customer_member(customer_id))$p$);
SELECT pg_temp.ensure_policy('cases', 'cases_partner_write',
  $p$CREATE POLICY cases_partner_write ON public.cases FOR UPDATE TO authenticated
     USING (public.is_partner_member(partner_id))
     WITH CHECK (public.is_partner_member(partner_id))$p$);
SELECT pg_temp.ensure_policy('cases', 'cases_partner_insert',
  $p$CREATE POLICY cases_partner_insert ON public.cases FOR INSERT TO authenticated
     WITH CHECK (public.is_partner_member(partner_id)
                 OR (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND public.is_partner_member(p.partner_id))))$p$);

-- ── Guards and plan limits ─────────────────────────────────────────────────
-- Partners: plan / status / owner / Stripe fields only by staff or the server (Stripe webhook).
CREATE OR REPLACE FUNCTION public.guard_partner_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') OR public.is_staff() THEN
    NEW.updated_at := now(); RETURN NEW;
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.status IS DISTINCT FROM OLD.status OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.legacy_client_id IS DISTINCT FROM OLD.legacy_client_id THEN
    RAISE EXCEPTION 'Only an administrator can change the partner''s plan, status or owner' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- A limit check: raises when count >= limit (limit -1 = unlimited).
CREATE OR REPLACE FUNCTION public._check_limit(p_partner uuid, p_key text, p_count bigint, p_label text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lim int;
BEGIN
  v_lim := coalesce((public.partner_limits(p_partner) ->> p_key)::int, -1);
  IF v_lim >= 0 AND p_count >= v_lim THEN
    RAISE EXCEPTION 'Your partner plan allows % % — upgrade to Pro for more', v_lim, p_label USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._partner_must_be_approved(p uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM partners WHERE id = p AND status = 'approved') THEN
    RAISE EXCEPTION 'This partner account is not approved yet' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') OR public.is_staff() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    RAISE EXCEPTION 'Only an administrator can move a customer to another partner' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public._partner_must_be_approved(NEW.partner_id);
    PERFORM public._check_limit(NEW.partner_id, 'maxCustomers',
      (SELECT count(*) FROM customers WHERE partner_id = NEW.partner_id AND NOT archived), 'customer(s)');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_partner_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') OR public.is_staff() THEN RETURN NEW; END IF;
  -- The partner's own owner row (created by request_partner) is always allowed.
  IF TG_OP = 'INSERT' AND NEW.role = 'owner' AND EXISTS (SELECT 1 FROM partners WHERE id = NEW.partner_id AND owner_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.role = 'owner' AND NOT public.is_partner_member(NEW.partner_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Only the owner can add another owner' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public._partner_must_be_approved(NEW.partner_id);
    PERFORM public._check_limit(NEW.partner_id, 'maxMembers',
      (SELECT count(*) FROM partner_members WHERE partner_id = NEW.partner_id), 'member(s)');
  END IF;
  RETURN NEW;
END $$;

-- Projects: partner/customer consistency, client user link, who may create, limits.
CREATE OR REPLACE FUNCTION public.guard_project_partner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cust customers%ROWTYPE; v_role text := coalesce(get_my_role(), ''); v_server boolean;
BEGIN
  v_server := coalesce(auth.role(), '') NOT IN ('authenticated', 'anon');
  -- Customer given: its partner wins; its client user becomes the project's client (legacy access).
  IF NEW.customer_id IS NOT NULL THEN
    SELECT * INTO v_cust FROM customers WHERE id = NEW.customer_id;
    IF NEW.partner_id IS NOT NULL AND NEW.partner_id IS DISTINCT FROM v_cust.partner_id THEN
      RAISE EXCEPTION 'The customer belongs to another partner' USING ERRCODE = '22023';
    END IF;
    NEW.partner_id := v_cust.partner_id;
    IF NEW.client_id IS NULL AND v_cust.client_user_id IS NOT NULL THEN NEW.client_id := v_cust.client_user_id; END IF;
  ELSIF NEW.client_id IS NOT NULL AND NEW.partner_id IS NULL THEN
    -- Older screens: a client's project goes to that client's customer / partner.
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

-- Cases: partner / customer from the project (or the client's customer), open-case limit.
CREATE OR REPLACE FUNCTION public.guard_case_partner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p uuid; v_c uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT partner_id, customer_id INTO v_p, v_c FROM projects WHERE id = NEW.project_id;
    NEW.partner_id := v_p; NEW.customer_id := v_c;
  ELSIF NEW.client_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
    SELECT partner_id, id INTO v_p, v_c FROM customers WHERE client_user_id = NEW.client_id ORDER BY created_at LIMIT 1;
    NEW.partner_id := coalesce(NEW.partner_id, v_p); NEW.customer_id := coalesce(NEW.customer_id, v_c);
  END IF;
  IF TG_OP = 'INSERT' AND NEW.partner_id IS NOT NULL
     AND coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.is_staff() THEN
    PERFORM public._check_limit(NEW.partner_id, 'maxOpenCases',
      (SELECT count(*) FROM cases WHERE partner_id = NEW.partner_id
         AND status::text NOT IN ('completed', 'closed', 'cancelled', 'resolved', 'terminated')), 'open case(s)');
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_partner_fields' AND tgrelid = 'public.partners'::regclass) THEN
    CREATE TRIGGER guard_partner_fields BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.guard_partner_fields();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_customer' AND tgrelid = 'public.customers'::regclass) THEN
    CREATE TRIGGER guard_customer BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_customer();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_partner_member' AND tgrelid = 'public.partner_members'::regclass) THEN
    CREATE TRIGGER guard_partner_member BEFORE INSERT OR UPDATE ON public.partner_members FOR EACH ROW EXECUTE FUNCTION public.guard_partner_member();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_project_partner' AND tgrelid = 'public.projects'::regclass) THEN
    CREATE TRIGGER guard_project_partner BEFORE INSERT OR UPDATE OF partner_id, customer_id, client_id ON public.projects
      FOR EACH ROW EXECUTE FUNCTION public.guard_project_partner();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_case_partner' AND tgrelid = 'public.cases'::regclass) THEN
    CREATE TRIGGER guard_case_partner BEFORE INSERT OR UPDATE OF project_id, client_id ON public.cases
      FOR EACH ROW EXECUTE FUNCTION public.guard_case_partner();
  END IF;
END $$;

-- ── RPCs ───────────────────────────────────────────────────────────────────
-- Ask for a partner account (pending until an admin approves it).
CREATE OR REPLACE FUNCTION public.request_partner(p_name text, p_kind text DEFAULT 'individual', p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'The partner needs a name' USING ERRCODE = '22023'; END IF;
  IF p_kind NOT IN ('individual', 'firm') THEN RAISE EXCEPTION 'Invalid partner type' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM partners WHERE owner_id = auth.uid() AND status IN ('pending', 'approved')) THEN
    RAISE EXCEPTION 'You already have a partner account or a pending request' USING ERRCODE = '42501';
  END IF;
  INSERT INTO partners (name, kind, owner_id, plan, status, request_note)
  VALUES (trim(p_name), p_kind, auth.uid(), 'free', 'pending', nullif(trim(coalesce(p_note, '')), ''))
  RETURNING id INTO v_id;
  INSERT INTO partner_members (partner_id, user_id, role) VALUES (v_id, auth.uid(), 'owner');
  INSERT INTO notifications (user_id, title, body, is_read, event_type)
  SELECT u.id, 'New partner request', trim(p_name) || ' asked for a partner account.', false, 'partner_request'
  FROM users u WHERE u.role::text = 'admin' AND u.verification_status = 'approved';
  RETURN v_id;
END $$;

-- Approve / reject / suspend a partner and set its plan (staff).
CREATE OR REPLACE FUNCTION public.review_partner(p_id uuid, p_status text, p_plan text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v partners%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Only administrators can review partners' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'suspended') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023'; END IF;
  UPDATE partners SET status = p_status, plan = coalesce(p_plan, plan), review_note = coalesce(p_note, review_note),
         approved_at = CASE WHEN p_status = 'approved' AND approved_at IS NULL THEN now() ELSE approved_at END,
         approved_by = CASE WHEN p_status = 'approved' AND approved_by IS NULL THEN auth.uid() ELSE approved_by END,
         plan_updated_at = CASE WHEN p_plan IS NOT NULL AND p_plan IS DISTINCT FROM plan THEN now() ELSE plan_updated_at END
   WHERE id = p_id RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found' USING ERRCODE = '22023'; END IF;
  INSERT INTO notifications (user_id, title, body, is_read, event_type)
  VALUES (v.owner_id, 'Partner account ' || p_status,
          'Your partner account "' || v.name || '" is ' || p_status || coalesce(' — ' || p_note, '') || '.', false, 'partner_review');
END $$;

-- Add an existing platform user to a partner by email (owner/admin of the partner, or staff).
CREATE OR REPLACE FUNCTION public.add_partner_member(p_partner uuid, p_email text, p_role text DEFAULT 'member')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT (public.is_staff() OR public.is_partner_member(p_partner, ARRAY['owner', 'admin'])) THEN
    RAISE EXCEPTION 'Only the partner''s owner or admins can add members' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_user FROM users WHERE lower(email) = lower(trim(p_email)) AND verification_status = 'approved';
  IF v_user IS NULL THEN RAISE EXCEPTION 'No approved platform user with that email — ask them to sign up first' USING ERRCODE = '22023'; END IF;
  INSERT INTO partner_members (partner_id, user_id, role) VALUES (p_partner, v_user, coalesce(p_role, 'member'))
  ON CONFLICT (partner_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN v_user;
END $$;

-- Invite a person to a customer by email; linked now if they already have an account,
-- otherwise when they sign up / log in with that email (claim_customer_invites).
CREATE OR REPLACE FUNCTION public.invite_customer_member(p_customer uuid, p_email text, p_role text DEFAULT 'key_user')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid; v_user uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM customers WHERE id = p_customer;
  IF v_partner IS NULL OR NOT (public.is_staff() OR public.is_partner_member(v_partner, ARRAY['owner', 'admin'])) THEN
    RAISE EXCEPTION 'Only the partner''s owner or admins can invite customer users' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_user FROM users WHERE lower(email) = lower(trim(p_email));
  IF v_user IS NOT NULL THEN
    INSERT INTO customer_members (customer_id, user_id, role) VALUES (p_customer, v_user, p_role)
    ON CONFLICT (customer_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO customer_invites (customer_id, email, role, invited_by, status, accepted_at)
    VALUES (p_customer, lower(trim(p_email)), p_role, auth.uid(), 'accepted', now());
    RETURN 'linked';
  END IF;
  INSERT INTO customer_invites (customer_id, email, role, invited_by) VALUES (p_customer, lower(trim(p_email)), p_role, auth.uid());
  RETURN 'invited';
END $$;

CREATE OR REPLACE FUNCTION public.claim_customer_invites()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_n integer := 0; r record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  FOR r IN SELECT * FROM customer_invites WHERE lower(email) = v_email AND status = 'pending' LOOP
    INSERT INTO customer_members (customer_id, user_id, role) VALUES (r.customer_id, auth.uid(), r.role)
    ON CONFLICT (customer_id, user_id) DO NOTHING;
    UPDATE customer_invites SET status = 'accepted', accepted_at = now() WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

-- The current user's partner / customer memberships (for the app).
CREATE OR REPLACE FUNCTION public.my_partner_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'partners', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'plan', p.plan,
                                  'status', p.status, 'role', m.role, 'limits', public.partner_limits(p.id),
                                  'review_note', p.review_note, 'logo_url', p.logo_url) ORDER BY p.created_at)
                          FROM partner_members m JOIN partners p ON p.id = m.partner_id WHERE m.user_id = auth.uid()), '[]'::jsonb),
    'customers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'partner_id', c.partner_id,
                                  'role', coalesce(cm.role, 'client')))
                           FROM customers c LEFT JOIN customer_members cm ON cm.customer_id = c.id AND cm.user_id = auth.uid()
                           WHERE cm.user_id IS NOT NULL OR c.client_user_id = auth.uid()), '[]'::jsonb));
$$;

-- SAP setup of one scope (customer / project), saved server-side with permission + plan checks.
CREATE OR REPLACE FUNCTION public.set_sap_integration_entry(p_scope text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid; v_n int;
BEGIN
  IF NOT public._can_manage_sap_scope(p_scope) THEN
    RAISE EXCEPTION 'You cannot change the SAP setup of this customer or project' USING ERRCODE = '42501';
  END IF;
  v_partner := public.partner_for_scope(p_scope);
  IF v_partner IS NOT NULL AND NOT public.is_staff() THEN
    v_n := CASE WHEN jsonb_typeof(p_value -> 'environments') = 'array' THEN jsonb_array_length(p_value -> 'environments') ELSE 0 END;
    PERFORM public._check_limit(v_partner, 'maxSapEnvs', v_n - 1, 'SAP environment(s)');
  END IF;
  INSERT INTO system_settings (key, value) VALUES ('sap_integration', jsonb_build_object(p_scope, coalesce(p_value, '{}'::jsonb)))
  ON CONFLICT (key) DO UPDATE SET value =
    (CASE WHEN jsonb_typeof(system_settings.value) = 'object' THEN system_settings.value ELSE '{}'::jsonb END)
    || jsonb_build_object(p_scope, coalesce(p_value, '{}'::jsonb));
END $$;

-- Validation overrides at partner / customer ('client') / project level.
CREATE OR REPLACE FUNCTION public.set_validation_override(p_level text, p_entity text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid;
BEGIN
  IF p_level NOT IN ('partner', 'client', 'project') THEN RAISE EXCEPTION 'Invalid level' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_staff() THEN
    v_partner := CASE p_level WHEN 'partner' THEN p_entity::uuid
                              WHEN 'client' THEN public.partner_for_scope(p_entity)
                              ELSE public.partner_for_scope('proj_' || p_entity) END;
    IF v_partner IS NULL OR NOT public.is_partner_member(v_partner, ARRAY['owner', 'admin']) THEN
      RAISE EXCEPTION 'You cannot change these validations' USING ERRCODE = '42501';
    END IF;
    IF coalesce((public.partner_limits(v_partner) ->> 'validations')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Custom validations need the Partner Pro plan' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO system_settings (key, value) VALUES ('validation_overrides', jsonb_build_object(p_level, jsonb_build_object(p_entity, coalesce(p_value, '{}'::jsonb))))
  ON CONFLICT (key) DO UPDATE SET value = jsonb_set(
    CASE WHEN jsonb_typeof(system_settings.value) = 'object' THEN system_settings.value ELSE '{}'::jsonb END,
    ARRAY[p_level],
    coalesce(CASE WHEN jsonb_typeof(system_settings.value -> p_level) = 'object' THEN system_settings.value -> p_level END, '{}'::jsonb)
      || jsonb_build_object(p_entity, coalesce(p_value, '{}'::jsonb)));
END $$;

-- Project VPNs are a Pro feature (save_sap_vpn_profile, re-created with the plan check).
CREATE OR REPLACE FUNCTION public.save_sap_vpn_profile(
  p_id uuid, p_scope text, p_name text, p_type text, p_gateway text, p_port integer,
  p_username text, p_secret text, p_config text, p_trusted_cert text, p_realm text, p_options jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_partner uuid;
BEGIN
  IF NOT public._can_manage_sap_scope(p_scope) THEN
    RAISE EXCEPTION 'You cannot manage the VPN profiles of this SAP setup' USING ERRCODE = '42501';
  END IF;
  v_partner := public.partner_for_scope(p_scope);
  IF v_partner IS NOT NULL AND NOT public.is_staff()
     AND coalesce((public.partner_limits(v_partner) ->> 'projectVpn')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Project VPNs need the Partner Pro plan' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'The VPN profile needs a name' USING ERRCODE = '22023'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO sap_vpn_profiles (scope_key, name, vpn_type, gateway, port, username, secret, config, trusted_cert, realm, options, updated_by)
    VALUES (p_scope, trim(p_name), p_type, nullif(trim(p_gateway), ''), p_port, nullif(trim(p_username), ''),
            coalesce(p_secret, ''), coalesce(p_config, ''), nullif(trim(p_trusted_cert), ''), nullif(trim(p_realm), ''),
            coalesce(p_options, '{}'::jsonb), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE sap_vpn_profiles SET
      name = trim(p_name), vpn_type = p_type, gateway = nullif(trim(p_gateway), ''), port = p_port,
      username = nullif(trim(p_username), ''),
      secret = coalesce(p_secret, secret), config = coalesce(p_config, config),
      trusted_cert = nullif(trim(p_trusted_cert), ''), realm = nullif(trim(p_realm), ''),
      options = coalesce(p_options, options), archived = false, updated_at = now(), updated_by = auth.uid()
    WHERE id = p_id AND scope_key = p_scope
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'VPN profile not found' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN v_id;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['is_staff()', '_partner_role(uuid, uuid)', 'is_partner_member(uuid, text[])', '_customer_member(uuid, uuid)',
                           'is_customer_member(uuid)', 'partner_limits(uuid)', 'partner_for_scope(text)', '_check_limit(uuid, text, bigint, text)',
                           '_partner_must_be_approved(uuid)', 'request_partner(text, text, text)', 'review_partner(uuid, text, text, text)',
                           'add_partner_member(uuid, text, text)', 'invite_customer_member(uuid, text, text)', 'claim_customer_invites()',
                           'my_partner_context()', 'set_sap_integration_entry(text, jsonb)', 'set_validation_override(text, text, jsonb)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ── Existing data ──────────────────────────────────────────────────────────
-- 1. Every customer company (client_profiles) → its own partner ('direct', Pro, approved) with
--    itself as its only customer (customer id = the client user's id).
INSERT INTO partners (name, kind, owner_id, plan, status, approved_at, legacy_client_id)
SELECT coalesce(nullif(trim(cp.company_name), ''), u.full_name, 'Customer'), 'direct', cp.id, 'pro', 'approved', now(), cp.id
FROM client_profiles cp JOIN users u ON u.id = cp.id
WHERE NOT EXISTS (SELECT 1 FROM partners p WHERE p.legacy_client_id = cp.id);

INSERT INTO partner_members (partner_id, user_id, role)
SELECT p.id, p.owner_id, 'owner' FROM partners p WHERE p.legacy_client_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO customers (id, partner_id, name, industry, website, logo_url, contact_name, contact_email, contact_phone, client_user_id)
SELECT cp.id, p.id, p.name, cp.industry, cp.website, cp.logo_url, cp.contact_name, cp.contact_email, cp.contact_phone, cp.id
FROM client_profiles cp JOIN partners p ON p.legacy_client_id = cp.id
ON CONFLICT (id) DO NOTHING;

-- The customers' team members with a platform account become customer users.
INSERT INTO customer_members (customer_id, user_id, role)
SELECT ctm.client_id, u.id,
       -- the role column is named differently across databases (role / system_role / role_type)
       CASE WHEN coalesce(to_jsonb(ctm) ->> 'system_role', to_jsonb(ctm) ->> 'role', to_jsonb(ctm) ->> 'role_type') IN ('project_manager', 'key_user', 'final_user')
            THEN coalesce(to_jsonb(ctm) ->> 'system_role', to_jsonb(ctm) ->> 'role', to_jsonb(ctm) ->> 'role_type') ELSE 'key_user' END
FROM client_team_members ctm JOIN users u ON lower(u.email) = lower(ctm.email)
WHERE ctm.client_id IN (SELECT id FROM customers) AND u.id <> ctm.client_id
ON CONFLICT DO NOTHING;

-- 2. The platform's own partner: "Solution Factory CA" (the existing customer company, or a new
--    firm owned by the first admin), Pro. Admosa becomes its customer.
DO $$
DECLARE v_sf uuid; v_admin uuid; v_admosa uuid;
BEGIN
  SELECT p.id INTO v_sf FROM partners p WHERE p.name ILIKE 'Solution Factory%' ORDER BY p.created_at LIMIT 1;
  IF v_sf IS NULL THEN
    SELECT id INTO v_admin FROM users WHERE role::text = 'admin' AND verification_status = 'approved' ORDER BY created_at LIMIT 1;
    IF v_admin IS NULL THEN RETURN; END IF;
    INSERT INTO partners (name, kind, owner_id, plan, status, approved_at)
    VALUES ('Solution Factory CA', 'firm', v_admin, 'pro', 'approved', now()) RETURNING id INTO v_sf;
    INSERT INTO partner_members (partner_id, user_id, role) VALUES (v_sf, v_admin, 'owner') ON CONFLICT DO NOTHING;
  ELSE
    UPDATE partners SET kind = 'firm', plan = 'pro' WHERE id = v_sf;
  END IF;
  -- Admins are members of the platform's partner.
  INSERT INTO partner_members (partner_id, user_id, role)
  SELECT v_sf, id, 'admin' FROM users WHERE role::text = 'admin' AND verification_status = 'approved'
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_admosa FROM customers WHERE partner_id = v_sf AND name ILIKE 'Admosa%' LIMIT 1;
  IF v_admosa IS NULL THEN
    INSERT INTO customers (partner_id, name, industry) VALUES (v_sf, 'Admosa', 'Automotive') RETURNING id INTO v_admosa;
  END IF;
  -- Admosa projects without a customer → Solution Factory CA / Admosa; their creators join the partner.
  INSERT INTO partner_members (partner_id, user_id, role)
  SELECT DISTINCT v_sf, created_by, 'member' FROM projects
  WHERE client_id IS NULL AND (name ILIKE '%admosa%' OR name ILIKE '%sopesa%') AND created_by IS NOT NULL
  ON CONFLICT DO NOTHING;
  UPDATE projects SET partner_id = v_sf, customer_id = v_admosa
  WHERE client_id IS NULL AND partner_id IS NULL AND (name ILIKE '%admosa%' OR name ILIKE '%sopesa%');
  -- Other projects without a customer created by staff (or by nobody) → the platform's partner, internal.
  UPDATE projects p SET partner_id = v_sf
  WHERE p.client_id IS NULL AND p.partner_id IS NULL
    AND (p.created_by IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id = p.created_by AND u.role::text IN ('admin', 'manager')));
END $$;

-- 3. Consultants' own projects without a customer → an 'individual' partner per consultant (Free, approved).
INSERT INTO partners (name, kind, owner_id, plan, status, approved_at)
SELECT DISTINCT ON (u.id) coalesce(nullif(trim(u.full_name), ''), u.email), 'individual', u.id, 'free', 'approved', now()
FROM projects p JOIN users u ON u.id = p.created_by
WHERE p.client_id IS NULL AND p.partner_id IS NULL AND u.role::text = 'consultant'
  AND NOT EXISTS (SELECT 1 FROM partners x WHERE x.owner_id = u.id);
INSERT INTO partner_members (partner_id, user_id, role)
SELECT p.id, p.owner_id, 'owner' FROM partners p WHERE p.kind = 'individual' ON CONFLICT DO NOTHING;
UPDATE projects pr SET partner_id = x.id
FROM partners x WHERE pr.client_id IS NULL AND pr.partner_id IS NULL AND x.owner_id = pr.created_by AND x.kind = 'individual';

-- 4. Projects of a customer company → its partner / customer.
UPDATE projects pr SET partner_id = c.partner_id, customer_id = c.id
FROM customers c WHERE pr.client_id = c.client_user_id AND pr.partner_id IS NULL;

-- 5. Cases follow their project, or their client's customer.
UPDATE cases c SET partner_id = p.partner_id, customer_id = p.customer_id
FROM projects p WHERE c.project_id = p.id AND (c.partner_id IS DISTINCT FROM p.partner_id OR c.customer_id IS DISTINCT FROM p.customer_id);
UPDATE cases c SET partner_id = x.partner_id, customer_id = x.id
FROM customers x WHERE c.project_id IS NULL AND c.client_id = x.client_user_id AND c.partner_id IS NULL;

-- 6. Partner plan defaults in plan_config when it exists (the app and partner_limits() have the same defaults).
UPDATE system_settings SET value = value || jsonb_build_object('partner', jsonb_build_object(
  'free', '{"label":"Free","maxCustomers":1,"maxProjects":1,"maxOpenCases":3,"maxMembers":1,"maxSapEnvs":1,"projectVpn":false,"sapImplementation":false,"validations":false}'::jsonb,
  'pro',  '{"label":"Pro","maxCustomers":-1,"maxProjects":-1,"maxOpenCases":-1,"maxMembers":5,"maxSapEnvs":-1,"projectVpn":true,"sapImplementation":true,"validations":true}'::jsonb))
WHERE key = 'plan_config' AND NOT (value ? 'partner');
