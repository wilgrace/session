-- Add event_color to session_templates (default: current blue)
ALTER TABLE "session_templates"
ADD COLUMN IF NOT EXISTS "event_color" text DEFAULT '#3b82f6';

-- Add duration_minutes to session_schedules (nullable, falls back to template)
ALTER TABLE "session_schedules"
ADD COLUMN IF NOT EXISTS "duration_minutes" integer;

COMMENT ON COLUMN "session_templates"."event_color" IS 'Hex color for calendar event display';
COMMENT ON COLUMN "session_schedules"."duration_minutes" IS 'Optional per-schedule duration override; falls back to template duration_minutes if null';
