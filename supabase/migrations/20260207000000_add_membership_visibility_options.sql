-- Add new visibility columns for membership sign-up options
-- show_on_booking_page: Show membership when booking a session
-- show_on_membership_page: Enable dedicated membership landing page

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS show_on_booking_page BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_membership_page BOOLEAN NOT NULL DEFAULT true;

-- Migrate existing data: display_to_non_members -> show_on_booking_page
UPDATE public.memberships SET show_on_booking_page = display_to_non_members;

-- Note: Keeping display_to_non_members for backward compatibility
-- Can be removed in a future migration after code is updated
