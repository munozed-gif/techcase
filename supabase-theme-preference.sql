-- Add ui_theme preference to users table
-- Default 'dark', can be 'light'
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ui_theme text DEFAULT 'dark'
    CHECK (ui_theme IN ('dark', 'light'));
