-- Update the default waiting_list email template text for orgs that haven't customised it.
-- Only rows that still carry the original seeded content are updated, so custom templates are preserved.

UPDATE org_email_templates
SET
  subject = 'A space has opened up for {{session_name}}!',
  content = '<p>Hi {{first_name}},</p>
<p>Great news — a space has just become available for <strong>{{session_name}}</strong>. Book now before it fills up again!</p>',
  updated_at = now()
WHERE
  type = 'waiting_list'
  AND subject = 'There''s now space for you at {{session_name}}'
  AND content = '<p>Hi {{first_name}},</p><p>You joined the waiting list for {{session_name}}. You''re in luck! There has been a cancellation and there''s now space for you.</p>';
