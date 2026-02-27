-- Add default drop-in price to organizations
-- This value is used to pre-populate the drop-in price when creating new sessions.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_dropin_price integer;
