-- ============================================================
-- TechCase — Fix infinite recursion in users RLS policies
-- The original users_admin_all policy queried public.users from
-- within a policy on public.users, causing infinite recursion.
-- Solution: security definer function that bypasses RLS.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Security definer function reads role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 2. Drop recursive policies
DROP POLICY IF EXISTS "users_self_read"   ON public.users;
DROP POLICY IF EXISTS "users_admin_read"  ON public.users;
DROP POLICY IF EXISTS "users_admin_all"   ON public.users;

-- 3. Recreate without recursion
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_admin_read" ON public.users
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "users_admin_write" ON public.users
  FOR ALL USING (public.get_my_role() IN ('admin', 'manager'));
