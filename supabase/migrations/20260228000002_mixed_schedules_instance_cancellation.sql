-- Mixed schedules + instance cancellation schema migration

-- 1. Remove is_recurring from session_templates (no longer needed — inferred from child records)
ALTER TABLE session_templates DROP COLUMN IF EXISTS is_recurring;
-- Add soft-delete support
ALTER TABLE session_templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Add ended_at to session_schedules (allows a recurring schedule to stop on a given date)
ALTER TABLE session_schedules ADD COLUMN IF NOT EXISTS ended_at date;

-- 3. Extend session_instances with schedule tracking, cancellation, and override columns
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES session_schedules(id);
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS cancelled_by_user_id text;
-- Instance-level overrides (null = inherit from template)
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS name_override text;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS description_override text;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS booking_instructions_override text;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS pricing_type_override text;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS drop_in_price_override integer;
ALTER TABLE session_instances ADD COLUMN IF NOT EXISTS member_price_override integer;

-- 4. Unique constraint on session_instances(template_id, start_time) — prevents duplicate instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_instances_template_id_start_time_key'
    AND conrelid = 'session_instances'::regclass
  ) THEN
    ALTER TABLE session_instances ADD CONSTRAINT session_instances_template_id_start_time_key UNIQUE (template_id, start_time);
  END IF;
END $$;

-- 5. Add soft-delete / cancellation fields to bookings
-- (paid bookings are soft-deleted to preserve financial records; free bookings are hard-deleted)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by_user_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount integer; -- pence
