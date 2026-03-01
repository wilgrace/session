-- Backfill session_cancellation email template for all existing orgs that don't have it yet
INSERT INTO org_email_templates (organization_id, type, subject, content, is_active)
SELECT
  o.id,
  'session_cancellation',
  '{{session_name}} on {{session_date}} has been cancelled',
  '<p>Hi {{first_name}},</p>
<p>We''re sorry — <strong>{{session_name}}</strong> on <strong>{{session_date}}</strong> at <strong>{{session_time}}</strong> has been cancelled by {{org_name}}.</p>
<p>{{cancellation_reason}}</p>',
  true
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM org_email_templates t
  WHERE t.organization_id = o.id AND t.type = 'session_cancellation'
);
