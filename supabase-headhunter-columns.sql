-- ============================================================
-- TechCase — Headhunter columns
-- Adds headhunter_id to users so headhunters can link
-- candidates to their roster.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS headhunter_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_headhunter_id_idx
  ON public.users (headhunter_id)
  WHERE headhunter_id IS NOT NULL;
