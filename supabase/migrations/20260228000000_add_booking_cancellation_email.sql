-- Seed booking_cancellation email template for all existing orgs that don't have it yet
INSERT INTO org_email_templates (organization_id, type, subject, content, is_active)
SELECT
  id,
  'booking_cancellation',
  'Your booking for {{session_name}} has been cancelled',
  '<p>Hi {{first_name}},</p>
<p>Your booking for <strong>{{session_name}}</strong> has been cancelled.</p>',
  true
FROM organizations
WHERE id NOT IN (
  SELECT organization_id FROM org_email_templates WHERE type = 'booking_cancellation'
);
