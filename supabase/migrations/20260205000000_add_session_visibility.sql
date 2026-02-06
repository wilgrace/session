-- Add visibility field to session_templates (replaces is_open boolean)
-- Values: 'open' (default), 'hidden', 'closed'

-- Add the new visibility column
ALTER TABLE session_templates
ADD COLUMN visibility text NOT NULL DEFAULT 'open';

-- Migrate existing data from is_open to visibility
UPDATE session_templates
SET visibility = CASE
  WHEN is_open = true THEN 'open'
  WHEN is_open = false THEN 'closed'
  ELSE 'open'
END;

-- Add a check constraint to validate visibility values
ALTER TABLE session_templates
ADD CONSTRAINT session_templates_visibility_check
CHECK (visibility IN ('open', 'hidden', 'closed'));

-- Drop the old is_open column
ALTER TABLE session_templates DROP COLUMN is_open;

-- Add index for filtering by visibility
CREATE INDEX idx_session_templates_visibility ON session_templates(visibility);

-- Add comment to document the field
COMMENT ON COLUMN session_templates.visibility IS 'Session visibility: open (public), hidden (direct link only), closed (not bookable)';
