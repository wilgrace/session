-- Add public (anon) read policies for session booking pages.
-- These policies allow unauthenticated visitors to read session data
-- for open/hidden templates, closing the gap left by the service-role alias bug.
-- session_one_off_dates already has a public read policy ("Public can read one_off_dates").

-- session_templates: anon and authenticated can read open and hidden sessions.
-- Closed sessions remain invisible to non-admins at the database level.
CREATE POLICY "Public can read open and hidden session templates"
  ON session_templates FOR SELECT
  TO anon, authenticated
  USING (visibility IN ('open', 'hidden'));

-- session_schedules: anon and authenticated can read schedules whose template is public.
CREATE POLICY "Public can read schedules for open and hidden templates"
  ON session_schedules FOR SELECT
  TO anon, authenticated
  USING (
    session_template_id IN (
      SELECT id FROM session_templates WHERE visibility IN ('open', 'hidden')
    )
  );

-- session_instances: anon and authenticated can read instances whose template is public.
CREATE POLICY "Public can read instances for open and hidden templates"
  ON session_instances FOR SELECT
  TO anon, authenticated
  USING (
    template_id IN (
      SELECT id FROM session_templates WHERE visibility IN ('open', 'hidden')
    )
  );
