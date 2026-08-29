-- Add created_by column to cases table to track who created each case
ALTER TABLE cases ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
