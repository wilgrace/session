-- Migration: add_unassigned_sentinel_org
--
-- Creates a dedicated "holding pen" org for all new signups that arrive via the
-- root /sign-up page (intended for new org owners, but sometimes hit by booking
-- customers by mistake). Using a sentinel org separates the "unassigned" state
-- from the real DEFAULT_ORGANIZATION_ID (which is a bookable org).
--
-- After running this migration:
--   1. Add the following to your .env.local and Vercel env vars:
--        UNASSIGNED_ORGANIZATION_ID=f47ac10b-58cc-4372-a567-0e02b2c3d479
--   2. Deploy the updated Clerk webhook Edge Function (reads UNASSIGNED_ORGANIZATION_ID)
--
-- The sentinel org has no slug and no bookable sessions. Users assigned here are
-- either lost customers (wayfinded to the correct org) or new org admins
-- (continue through the onboarding wizard).

INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Unassigned',
  NULL,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
