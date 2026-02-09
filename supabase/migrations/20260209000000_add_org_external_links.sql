-- Add external link fields to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS homepage_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS facebook_url TEXT;
