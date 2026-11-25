-- Partner profile: "About us" text and specialties, shown on the "Who we are" slide of proposal presentations.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS about text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS specialties text[] NOT NULL DEFAULT '{}';
