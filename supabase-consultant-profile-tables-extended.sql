-- ============================================================
-- TechCase — Extended consultant profile tables
-- Creates work_authorizations, consultant_customers, and
-- consultant_projects tables if they don't exist, and adds
-- featured_skills column to consultant_profiles.
--
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- featured_skills on consultant_profiles
ALTER TABLE public.consultant_profiles
  ADD COLUMN IF NOT EXISTS featured_skills text[] DEFAULT '{}';

-- work_authorizations
CREATE TABLE IF NOT EXISTS public.work_authorizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id   uuid NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
  country_name    text NOT NULL,
  country_code    text,
  auth_type       text DEFAULT 'citizen'
    CHECK (auth_type IN ('citizen', 'permanent_resident', 'work_visa', 'other')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_authorizations_consultant_id_idx
  ON public.work_authorizations (consultant_id);

-- consultant_customers (work experience / companies)
CREATE TABLE IF NOT EXISTS public.consultant_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id   uuid NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
  company_name    text NOT NULL,
  role_held       text,
  start_date      date,
  end_date        date,
  description     text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultant_customers_consultant_id_idx
  ON public.consultant_customers (consultant_id);

-- consultant_projects
CREATE TABLE IF NOT EXISTS public.consultant_projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id       uuid NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
  title               text NOT NULL,
  role                text,
  client_name         text,
  consulting_company  text,
  description         text,
  url                 text,
  tech_stack          text[] DEFAULT '{}',
  featured            boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultant_projects_consultant_id_idx
  ON public.consultant_projects (consultant_id);
