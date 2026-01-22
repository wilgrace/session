-- Add slug column to organizations table with a temporary default
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing orgs with slugified version of their id
-- Convert to lowercase, replace non-alphanumeric with hyphens, trim trailing hyphens
UPDATE organizations
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(id, '[^a-zA-Z0-9]+', '-', 'g'), '-+$', ''))
WHERE slug IS NULL;

-- Handle any empty slugs by using the id directly
UPDATE organizations
SET slug = id
WHERE slug IS NULL OR slug = '';

-- Add NOT NULL constraint after backfill
ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;

-- Set a default for new inserts (will be overridden by app logic)
ALTER TABLE organizations ALTER COLUMN slug SET DEFAULT '';

-- Add unique constraint (drop first if exists to make idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_slug_unique'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Create high-performance lookup function
CREATE OR REPLACE FUNCTION get_organization_by_slug(slug_text TEXT)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  slug TEXT,
  description TEXT,
  logo_url TEXT
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT o.id, o.name, o.slug, o.description, o.logo_url
  FROM organizations o
  WHERE o.slug = slug_text
  LIMIT 1;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_organization_by_slug(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_by_slug(TEXT) TO anon;
