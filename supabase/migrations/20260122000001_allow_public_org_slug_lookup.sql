-- Allow public (anonymous) read access to organization slugs for URL validation
-- This is needed by the middleware to validate slugs before routing

-- First, ensure RLS is enabled
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read organization id, name, and slug (public info)
CREATE POLICY "Anyone can read organization public info"
  ON organizations
  FOR SELECT
  USING (true);
