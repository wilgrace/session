-- Add admin notification email to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS admin_notification_email text;

-- Seed booking_cancellation_notification email template for all existing orgs
INSERT INTO org_email_templates (organization_id, type, subject, content, is_active)
SELECT
  id,
  'booking_cancellation_notification',
  'Booking cancelled – {{session_name}}',
  '<p>Hi there,</p>
<p><strong>{{user_name}}</strong> ({{user_email}}) has cancelled their booking for <strong>{{session_name}}</strong>.</p>',
  true
FROM organizations
WHERE id NOT IN (
  SELECT organization_id FROM org_email_templates WHERE type = 'booking_cancellation_notification'
);
