-- Add drop_in_enabled to session_templates
-- Controls whether drop-in pricing is available for this session
ALTER TABLE session_templates ADD COLUMN drop_in_enabled boolean NOT NULL DEFAULT true;

-- Add is_enabled to session_membership_prices
-- Controls whether a membership pricing option is available for a session
-- (table now serves as per-session membership configuration, not just price overrides)
ALTER TABLE session_membership_prices ADD COLUMN is_enabled boolean NOT NULL DEFAULT true;
