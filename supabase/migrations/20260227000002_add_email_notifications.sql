-- Add notification_from_email to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notification_from_email text;

-- Create org_email_templates table
CREATE TABLE IF NOT EXISTS org_email_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'booking_confirmation' | 'membership_confirmation' | 'waiting_list'
  subject text NOT NULL,
  content text NOT NULL, -- Editable HTML/text with {{variable}} placeholders
  reply_to text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint (one template per type per org)
ALTER TABLE org_email_templates ADD CONSTRAINT org_email_templates_org_type_unique UNIQUE (organization_id, type);

-- Enable RLS
ALTER TABLE org_email_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage email templates for their org
CREATE POLICY "Admins can manage email templates"
  ON org_email_templates
  FOR ALL
  TO authenticated
  USING (organization_id = (auth.jwt() ->> 'org_id'))
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id'));

-- Seed default templates for existing orgs
INSERT INTO org_email_templates (organization_id, type, subject, content, is_active)
SELECT
  id,
  'booking_confirmation',
  'Your booking is confirmed – {{session_name}}',
  '<p>Hi {{first_name}},</p><p>Your booking is confirmed. We look forward to seeing you soon!</p>',
  true
FROM organizations
WHERE id NOT IN (
  SELECT organization_id FROM org_email_templates WHERE type = 'booking_confirmation'
);

INSERT INTO org_email_templates (organization_id, type, subject, content, is_active)
SELECT
  id,
  'membership_confirmation',
  'Welcome to {{org_name}} – Membership Confirmed',
  '<p>Hi {{first_name}},</p><p>Your membership is now active. Enjoy discounted access to all sessions!</p>',
  true
FROM organizations
WHERE id NOT IN (
  SELECT organization_id FROM org_email_templates WHERE type = 'membership_confirmation'
);

INSERT INTO org_email_templates (organization_id, type, subject, content, is_active)
SELECT
  id,
  'waiting_list',
  'You''re on the waiting list for {{session_name}}',
  '<p>Hi {{first_name}},</p><p>You''ve been added to the waiting list for {{session_name}}. We''ll let you know if a spot opens up!</p>',
  false
FROM organizations
WHERE id NOT IN (
  SELECT organization_id FROM org_email_templates WHERE type = 'waiting_list'
);
