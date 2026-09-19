-- ============================================================
-- TechCase — Case Templates table
-- Stores reusable case templates (global and user-created).
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.case_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  category      text,
  description   text,
  template_data jsonb       NOT NULL DEFAULT '{}',
  is_global     boolean     NOT NULL DEFAULT false,
  created_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  use_count     integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_templates_created_by_idx ON public.case_templates(created_by);
CREATE INDEX IF NOT EXISTS case_templates_use_count_idx  ON public.case_templates(use_count DESC);

ALTER TABLE public.case_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ct_read_auth"   ON public.case_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ct_write_admin" ON public.case_templates FOR ALL   USING (public.get_my_role() IN ('admin','manager'));
CREATE POLICY "ct_self_write"  ON public.case_templates FOR ALL   USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
