-- Change default role for new clerk_users from 'admin' to 'user'
-- New tenant admins will be explicitly promoted to 'admin' during onboarding.
-- Booking customers who sign up via the auth overlay will now correctly get 'user' role.
ALTER TABLE clerk_users ALTER COLUMN role SET DEFAULT 'user';
