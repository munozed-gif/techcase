-- Names / emails of the people in a partner or customer, for the Partner area. The users table
-- only lets people read their own row; these return the minimum (name, email, avatar) and only
-- to members of that partner (or its customer's partner) and to staff.

CREATE OR REPLACE FUNCTION public.partner_people(p_partner uuid)
RETURNS TABLE (user_id uuid, role text, full_name text, email text, avatar_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.role, u.full_name, u.email, u.avatar_url, m.created_at
  FROM partner_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.partner_id = p_partner
    AND (public.is_staff() OR public.is_partner_member(p_partner))
  ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC, m.created_at;
$$;

CREATE OR REPLACE FUNCTION public.customer_people(p_customer uuid)
RETURNS TABLE (user_id uuid, role text, full_name text, email text, avatar_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (SELECT id, partner_id, client_user_id, created_at FROM customers WHERE id = p_customer),
  ok AS (SELECT 1 FROM c WHERE public.is_staff() OR public.is_partner_member(c.partner_id) OR public.is_customer_member(c.id))
  SELECT x.user_id, x.role, u.full_name, u.email, u.avatar_url, x.created_at
  FROM (
    SELECT c.client_user_id AS user_id, 'account_owner'::text AS role, c.created_at FROM c WHERE c.client_user_id IS NOT NULL
    UNION ALL
    SELECT m.user_id, m.role, m.created_at FROM customer_members m WHERE m.customer_id = p_customer
  ) x LEFT JOIN users u ON u.id = x.user_id
  WHERE EXISTS (SELECT 1 FROM ok)
  ORDER BY (x.role = 'account_owner') DESC, x.created_at;
$$;

REVOKE EXECUTE ON FUNCTION public.partner_people(uuid), public.customer_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_people(uuid), public.customer_people(uuid) TO authenticated, service_role;
