import type { EmailTemplateType } from './db/schema';

export interface EmailTemplateDefault {
  type: EmailTemplateType;
  label: string;
  subject: string;
  content: string;
  /** Variables available in the editable content via {{variable}} */
  editableVariables: string[];
  /** Non-editable data auto-injected into the email at send time */
  injectedFields: string[];
}

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  booking_confirmation: 'Booking Confirmation',
  booking_cancellation: 'Booking Cancellation',
  booking_cancellation_notification: 'Cancellation (Admin)',
  membership_confirmation: 'Membership Confirmation',
  waiting_list: 'Waiting List',
  session_cancellation: 'Session Cancellation (Admin-initiated)',
};

export const EMAIL_TEMPLATE_DESCRIPTIONS: Record<EmailTemplateType, string> = {
  booking_confirmation: 'Sent after successful checkout or booking',
  booking_cancellation: 'Sent to the user when they cancel a booking',
  booking_cancellation_notification: 'Sent to admin when a user cancels a booking',
  membership_confirmation: 'Sent after a new membership is activated',
  waiting_list: 'Sent when a space opens up on the waiting list',
  session_cancellation: 'Sent to attendees when an admin cancels a session',
};

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateType, EmailTemplateDefault> = {
  booking_confirmation: {
    type: 'booking_confirmation',
    label: 'Booking Confirmation',
    subject: 'Your booking is confirmed – {{session_name}}',
    content: `<p>Hi {{first_name}},</p>
<p>Your booking is confirmed. We look forward to seeing you soon!</p>`,
    editableVariables: ['{{first_name}}', '{{session_name}}', '{{org_name}}'],
    injectedFields: [
      'Session name (with event colour dot)',
      'Session image',
      'Date',
      'Time',
      'Duration',
      'Number of spaces',
      'Total paid',
      'Booking instructions',
      'View booking link',
    ],
  },
  membership_confirmation: {
    type: 'membership_confirmation',
    label: 'Membership Confirmation',
    subject: 'Welcome to {{org_name}} – Membership Confirmed',
    content: `<p>Hi {{first_name}},</p>
<p>Your membership is now active. Enjoy discounted access to all sessions!</p>`,
    editableVariables: ['{{first_name}}', '{{org_name}}'],
    injectedFields: [
      'Membership name',
      'Monthly price',
      'Next billing date',
      'Manage membership link',
    ],
  },
  booking_cancellation: {
    type: 'booking_cancellation',
    label: 'Booking Cancellation',
    subject: 'Your booking for {{session_name}} has been cancelled',
    content: `<p>Hi {{first_name}},</p>
<p>Your booking for <strong>{{session_name}}</strong> has been cancelled.</p>`,
    editableVariables: ['{{first_name}}', '{{session_name}}', '{{org_name}}'],
    injectedFields: [
      'Session name',
      'Date',
      'Time',
      'Refund note (if applicable)',
    ],
  },
  booking_cancellation_notification: {
    type: 'booking_cancellation_notification',
    label: 'Cancellation (Admin)',
    subject: 'Booking cancelled – {{session_name}}',
    content: `<p>Hi there,</p>
<p><strong>{{user_name}}</strong> ({{user_email}}) has cancelled their booking for <strong>{{session_name}}</strong>.</p>`,
    editableVariables: ['{{user_name}}', '{{user_email}}', '{{session_name}}', '{{org_name}}'],
    injectedFields: [
      'Session name',
      'Date',
      'Time',
      'Refund note (if applicable)',
    ],
  },
  waiting_list: {
    type: 'waiting_list',
    label: 'Waiting List',
    subject: "A space has opened up for {{session_name}}!",
    content: `<p>Hi {{first_name}},</p>
<p>Great news — a space has just become available for <strong>{{session_name}}</strong>. Book now before it fills up again!</p>`,
    editableVariables: ['{{first_name}}', '{{session_name}}', '{{org_name}}'],
    injectedFields: [
      'Session name',
      'Date',
      'Time',
      '"Book your space" button',
    ],
  },
  session_cancellation: {
    type: 'session_cancellation',
    label: 'Session Cancellation (Admin-initiated)',
    subject: '{{session_name}} on {{session_date}} has been cancelled',
    content: `<p>Hi {{first_name}},</p>
<p>We're sorry — <strong>{{session_name}}</strong> on <strong>{{session_date}}</strong> at <strong>{{session_time}}</strong> has been cancelled by {{org_name}}.</p>
<p>{{cancellation_reason}}</p>`,
    editableVariables: ['{{first_name}}', '{{session_name}}', '{{session_date}}', '{{session_time}}', '{{org_name}}', '{{cancellation_reason}}'],
    injectedFields: [
      'Session name',
      'Date',
      'Time',
      'Refund note (if applicable)',
    ],
  },
};

export const ALL_EMAIL_TYPES: EmailTemplateType[] = [
  'booking_confirmation',
  'booking_cancellation',
  'booking_cancellation_notification',
  'membership_confirmation',
  'waiting_list',
  'session_cancellation',
];
