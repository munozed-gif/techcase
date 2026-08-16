-- ============================================================
-- TechCase — Add trigger field + ensure "assigned" stage exists
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Step 1: Add trigger field to all existing stages
-- Sets trigger: "manual" on all stages except "assigned" → "auto"
UPDATE lifecycle_templates
SET stages = (
  SELECT jsonb_agg(
    stage || jsonb_build_object(
      'trigger',
      CASE
        WHEN stage->>'key' = 'assigned' THEN 'auto'
        ELSE COALESCE(stage->>'trigger', 'manual')
      END
    )
  )
  FROM jsonb_array_elements(stages) AS stage
)
WHERE stages IS NOT NULL
  AND jsonb_array_length(stages) > 0;

-- Step 2: Insert "assigned" stage into templates that don't have one yet.
-- Places it after the "estimated" stage (before "in_progress").
UPDATE lifecycle_templates
SET stages = (
  WITH ordered AS (
    SELECT stage, ordinality
    FROM jsonb_array_elements(stages) WITH ORDINALITY AS t(stage, ordinality)
  ),
  with_assigned AS (
    SELECT
      stage,
      ordinality,
      CASE
        WHEN stage->>'key' = 'estimated'
        THEN 1 -- flag: insert after this row
        ELSE 0
      END AS insert_after
    FROM ordered
  )
  SELECT jsonb_agg(s ORDER BY seq)
  FROM (
    SELECT stage AS s, ordinality * 2 AS seq FROM with_assigned
    UNION ALL
    SELECT
      jsonb_build_object(
        'key', 'assigned',
        'label', 'Assigned',
        'color', '#8B5CF6',
        'is_terminal', false,
        'trigger', 'auto'
      ) AS s,
      (ordinality * 2 + 1) AS seq
    FROM with_assigned
    WHERE insert_after = 1
  ) sub
)
WHERE stages IS NOT NULL
  AND jsonb_array_length(stages) > 0
  -- Only update templates that don't already have an "assigned" stage
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(stages) AS stage
    WHERE stage->>'key' = 'assigned'
  );
