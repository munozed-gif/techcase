-- Add education and certifications columns to consultant_profiles
-- and ensure languages column exists

alter table consultant_profiles
  add column if not exists education     jsonb not null default '[]'::jsonb,
  add column if not exists certifications jsonb not null default '[]'::jsonb,
  add column if not exists languages      text[] not null default '{}';

-- Notify PostgREST to reload its schema cache
notify pgrst, 'reload schema';
