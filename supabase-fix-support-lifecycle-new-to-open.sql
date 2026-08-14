-- ============================================================
-- TechCase — Fix Support Center lifecycle: replace "new" key with "open"
-- The first stage key was "new" which is not in the case_status enum.
-- Replace it with "open" (label stays "New") so case creation succeeds.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

UPDATE lifecycle_templates
SET stages = (
  SELECT jsonb_agg(
    CASE
      WHEN stage->>'key' = 'new'
      THEN jsonb_set(stage, '{key}', '"open"')
      ELSE stage
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(stages) WITH ORDINALITY AS t(stage, ordinality)
),
updated_at = now()
WHERE key = 'support';

-- Also fix any existing cases that were created with status = 'new'
-- (only if the 'new' enum value was added previously)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'case_status'::regtype AND enumlabel = 'new'
  ) THEN
    UPDATE cases SET status = 'open' WHERE status = 'new';
  END IF;
END $$;
