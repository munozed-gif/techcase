-- Extend role check constraint
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','manager','consultant','client','key_user','headhunter',
                  'final_user','internal_consultant','project_manager',
                  'dispatch','area_leader'));

-- area_leader_areas: many-to-many between area leaders and SAP areas
CREATE TABLE IF NOT EXISTS public.area_leader_areas (
  user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  area_sap  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, area_sap)
);
ALTER TABLE public.area_leader_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ala_read_auth"  ON public.area_leader_areas FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ala_write_admin" ON public.area_leader_areas FOR ALL USING (public.get_my_role() IN ('admin','manager'));

-- Add area_leader_id to cases (the assigned area leader for this case)
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS area_leader_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cases_area_leader_id_idx ON public.cases(area_leader_id);

NOTIFY pgrst, 'reload schema';
