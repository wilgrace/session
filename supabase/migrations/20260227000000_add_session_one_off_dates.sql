-- Create session_one_off_dates table to support multiple dates per one-off template
CREATE TABLE session_one_off_dates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
  organization_id text REFERENCES organizations(id),
  date date NOT NULL,
  time time NOT NULL,
  duration_minutes integer,  -- null = fall back to template.duration_minutes
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Migrate existing one-off data from session_templates columns
INSERT INTO session_one_off_dates (template_id, organization_id, date, time, duration_minutes)
SELECT id, organization_id, one_off_date, one_off_start_time, null
FROM session_templates
WHERE is_recurring = false
  AND one_off_date IS NOT NULL
  AND one_off_start_time IS NOT NULL;

-- Drop old columns from session_templates
ALTER TABLE session_templates DROP COLUMN IF EXISTS one_off_date;
ALTER TABLE session_templates DROP COLUMN IF EXISTS one_off_start_time;

-- Add update trigger (matches pattern on other tables)
CREATE TRIGGER update_session_one_off_dates_updated_at
  BEFORE UPDATE ON session_one_off_dates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE session_one_off_dates ENABLE ROW LEVEL SECURITY;

-- Admins can manage dates within their org
CREATE POLICY "Admins can manage one_off_dates"
  ON session_one_off_dates FOR ALL
  USING (organization_id = (auth.jwt() ->> 'org_id'))
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id'));

-- Public read (needed for booking calendar)
CREATE POLICY "Public can read one_off_dates"
  ON session_one_off_dates FOR SELECT
  USING (true);

-- Service role bypass (for edge functions and server actions)
CREATE POLICY "Service role bypass"
  ON session_one_off_dates FOR ALL
  USING (auth.role() = 'service_role');
