-- ============================================================
-- TechCase — AI Usage Gating
-- Adds is_pro + encrypted API key to users, monthly usage table.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- AI Pro flag and optional BYOK key on the user row
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropic_api_key_enc text;

-- Monthly generation tracking
CREATE TABLE IF NOT EXISTS ai_usage (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid    REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  month            char(7) NOT NULL,   -- 'YYYY-MM'
  generations_used integer DEFAULT 0   NOT NULL,
  UNIQUE(user_id, month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own row
CREATE POLICY "ai_usage_self"
  ON ai_usage FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins and managers can see all rows
CREATE POLICY "ai_usage_admin_read"
  ON ai_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );
