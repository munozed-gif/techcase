-- ============================================================
-- TechCase — Add key_user to lifecycle template allowed_roles
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Support template: key_user can act on new, returned, and user_test stages
UPDATE lifecycle_templates
SET stages = (
  SELECT jsonb_agg(
    CASE
      WHEN (stage->>'key') = ANY(ARRAY['new', 'returned', 'user_test'])
        AND NOT (stage->'allowed_roles' @> '"key_user"'::jsonb)
      THEN jsonb_set(stage, '{allowed_roles}', stage->'allowed_roles' || '["key_user"]'::jsonb)
      ELSE stage
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(stages) WITH ORDINALITY AS t(stage, ordinality)
), updated_at = now()
WHERE key = 'support';

-- Short / Standard / Large templates: key_user can act on the open stage
UPDATE lifecycle_templates
SET stages = (
  SELECT jsonb_agg(
    CASE
      WHEN (stage->>'key') = 'open'
        AND NOT (stage->'allowed_roles' @> '"key_user"'::jsonb)
      THEN jsonb_set(stage, '{allowed_roles}', stage->'allowed_roles' || '["key_user"]'::jsonb)
      ELSE stage
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(stages) WITH ORDINALITY AS t(stage, ordinality)
), updated_at = now()
WHERE key IN ('short', 'standard', 'large');
