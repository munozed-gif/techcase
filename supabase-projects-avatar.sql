-- Add avatar_url column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS avatar_url text;

-- Also create the storage bucket in the Supabase dashboard:
--   Name: project-avatars
--   Public: true (images are served via public URL)
-- Or run via SQL (requires pg_net / admin permissions):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('project-avatars', 'project-avatars', true)
--   ON CONFLICT (id) DO NOTHING;
