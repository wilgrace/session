-- Fix session_templates timezone default: was 'UTC', should be 'Europe/London'
-- Instances are stored correctly in UTC (generation always uses Europe/London),
-- but display code uses this field for formatInTimeZone(), so 'UTC' caused times
-- to show 1 hour early during BST.

-- Update all existing templates that have the old default
UPDATE session_templates
SET timezone = 'Europe/London'
WHERE timezone = 'UTC';

-- Change column default for future inserts
ALTER TABLE session_templates
  ALTER COLUMN timezone SET DEFAULT 'Europe/London';
