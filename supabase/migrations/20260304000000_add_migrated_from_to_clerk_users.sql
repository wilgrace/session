-- Add migrated_from column to clerk_users to track users imported from external platforms
ALTER TABLE clerk_users ADD COLUMN IF NOT EXISTS migrated_from text;

COMMENT ON COLUMN clerk_users.migrated_from IS 'Identifies the source platform for migrated users (e.g. ''acuity''). Cleared when user claims their account by signing up via Clerk.';

-- Make clerk_user_id nullable so migrated (placeholder) users can exist before they sign up
ALTER TABLE clerk_users ALTER COLUMN clerk_user_id DROP NOT NULL;

