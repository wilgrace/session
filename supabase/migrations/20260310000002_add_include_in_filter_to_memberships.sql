-- Add include_in_filter column to memberships table
-- When true, this membership appears as a filter option on the booking calendar

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS include_in_filter boolean NOT NULL DEFAULT false;
