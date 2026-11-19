-- Start / end time of reported work (optional). With both, the hours are end − start; the cost
-- analysis uses the exact moment to find the case's stage (rework / hypercare).
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE public.time_logs    ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE public.time_logs    ADD COLUMN IF NOT EXISTS end_time time;
