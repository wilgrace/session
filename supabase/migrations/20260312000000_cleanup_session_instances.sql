-- Migration: Cleanup session_instances table
-- 1. Add one_off_date_id FK to link instances back to their source one-off date
-- 2. Drop unused clerk_user_id column
-- 3. Normalise legacy hex event_color values to key strings

-- 1. Add one_off_date_id FK
ALTER TABLE session_instances
  ADD COLUMN IF NOT EXISTS one_off_date_id uuid REFERENCES session_one_off_dates(id) ON DELETE SET NULL;

-- Backfill: link existing one-off instances to their source dates using template timezone for UTC conversion
UPDATE session_instances si
SET one_off_date_id = sod.id
FROM session_one_off_dates sod
JOIN session_templates st ON st.id = sod.template_id
WHERE si.template_id = sod.template_id
  AND si.schedule_id IS NULL
  AND si.one_off_date_id IS NULL
  AND si.start_time = (
    (sod.date::text || 'T' || sod.time::text)::timestamp AT TIME ZONE st.timezone AT TIME ZONE 'UTC'
  );

-- 2. Drop unused clerk_user_id column from session_instances
ALTER TABLE session_instances
  DROP COLUMN IF EXISTS clerk_user_id;

-- 3. Normalise legacy hex event_color values to key strings
UPDATE session_templates SET event_color = 'blue'   WHERE event_color IN ('#3b82f6', '#0EA5E9', '#0ea5e9');
UPDATE session_templates SET event_color = 'green'  WHERE event_color IN ('#10B981', '#10b981');
UPDATE session_templates SET event_color = 'yellow' WHERE event_color IN ('#FDD34E', '#fdd34e');
UPDATE session_templates SET event_color = 'red'    WHERE event_color IN ('#F43F5E', '#f43f5e');
UPDATE session_templates SET event_color = 'purple' WHERE event_color IN ('#8B5CF6', '#8b5cf6');
-- Catch-all: any remaining hex values default to blue
UPDATE session_templates SET event_color = 'blue' WHERE event_color LIKE '#%';
