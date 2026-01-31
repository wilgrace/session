-- Change date_of_birth (date) to birth_year (integer)
ALTER TABLE clerk_users DROP COLUMN IF EXISTS date_of_birth;
ALTER TABLE clerk_users ADD COLUMN birth_year INTEGER;

-- Remove city column (no longer needed)
ALTER TABLE clerk_users DROP COLUMN IF EXISTS city;

-- Add comment for documentation
COMMENT ON COLUMN clerk_users.birth_year IS 'Year the user was born (4-digit year)';
