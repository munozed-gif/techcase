-- ============================================================
-- TechCase — Add trigger field to lifecycle_templates stages
-- Sets trigger: "manual" on all existing stages and
-- trigger: "auto" on stages whose key is "assigned".
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Add trigger field (default "manual") to every stage in every template
UPDATE lifecycle_templates
SET stages = (
  SELECT jsonb_agg(
    stage || jsonb_build_object(
      'trigger',
      CASE
        WHEN stage->>'key' = 'assigned' THEN 'auto'
        ELSE 'manual'
      END
    )
  )
  FROM jsonb_array_elements(stages) AS stage
)
WHERE stages IS NOT NULL
  AND jsonb_array_length(stages) > 0;
