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
  membership_confirmation: 'Membership Confirmation',
  waiting_list: 'Waiting List',
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
      'Number of spots',
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
  waiting_list: {
    type: 'waiting_list',
    label: 'Waiting List',
    subject: "You're on the waiting list for {{session_name}}",
    content: `<p>Hi {{first_name}},</p>
<p>You've been added to the waiting list for <strong>{{session_name}}</strong>. We'll let you know if a spot becomes available!</p>`,
    editableVariables: ['{{first_name}}', '{{session_name}}', '{{org_name}}'],
    injectedFields: [
      'Session name',
      'Date',
      'Time',
    ],
  },
};

export const ALL_EMAIL_TYPES: EmailTemplateType[] = [
  'booking_confirmation',
  'membership_confirmation',
  'waiting_list',
];
