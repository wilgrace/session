ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS cancellation_window_hours integer NOT NULL DEFAULT 0;
