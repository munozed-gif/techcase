-- Add missing columns to cases table
ALTER TABLE cases ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES auth.users(id);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS estimated_hours numeric;
