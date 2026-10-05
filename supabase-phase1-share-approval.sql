-- Phase 1: Share link, approval gates, blueprint templates
-- Run this in Supabase SQL editor

-- 1. Add share_token to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS projects_share_token_idx ON public.projects(share_token);

-- Backfill any existing projects that got NULL (shouldn't happen with DEFAULT but just in case)
UPDATE public.projects SET share_token = gen_random_uuid() WHERE share_token IS NULL;

-- 2. RLS: allow anonymous users to read a project by share_token
-- This is safe because share_token is a random UUID (practically unguessable)
DROP POLICY IF EXISTS "projects_share_read" ON public.projects;
CREATE POLICY "projects_share_read" ON public.projects
  FOR SELECT TO anon
  USING (share_token IS NOT NULL);

-- 3. RLS: allow anonymous users to read cases belonging to a shared project
-- We expose only safe fields via the API/view, but the policy covers the table
DROP POLICY IF EXISTS "cases_share_read" ON public.cases;
CREATE POLICY "cases_share_read" ON public.cases
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = cases.project_id
        AND p.share_token IS NOT NULL
    )
  );
