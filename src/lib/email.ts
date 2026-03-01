import { Resend } from 'resend';
import { createSupabaseServerClient } from './supabase';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  renderTemplate,
  escapeHtml,
  buildEmailWrapper,
  buildCtaButton,
  buildDetailRow,
} from './email-html';

// Re-export preview builders so callers can import from a single place
export {
  renderTemplate,
  buildBookingConfirmationPreview,
  buildBookingCancellationPreview,
  buildBookingCancellationNotificationPreview,
  buildMembershipConfirmationPreview,
  buildWaitingListPreview,
} from './email-html';

const resend = new Resend(process.env.RESEND_API_KEY);

// ---------------------------------------------------------------------------
// Low-level send
// ---------------------------------------------------------------------------

export async function sendEmail({
  from,
  to,
  subject,
  html,
  replyTo,
  idempotencyKey,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string | null;
  idempotencyKey: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send(
      {
        from,
        to: [to],
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
      },
      { idempotencyKey }
    );

    if (error) {
      console.error('[sendEmail] Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[sendEmail] Unexpected error:', err);
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Booking confirmation
// ---------------------------------------------------------------------------

export async function sendBookingConfirmationEmail(
  bookingId: string,
  organizationId: string
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: template } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'booking_confirmation')
      .single();

    if (!template || !template.is_active) {
      return;
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        amount_paid,
        user_id,
        session_instance_id,
        session_instances (
          id,
          start_time,
          end_time,
          template_id,
          session_templates (
            id,
            name,
            duration_minutes,
            image_url,
            event_color,
            booking_instructions,
            timezone
          )
        ),
        clerk_users (
          email,
          first_name,
          last_name
        )
      `)
      .eq('id', bookingId)
      .single();

    if (!booking) {
      console.error('[sendBookingConfirmationEmail] Booking not found:', bookingId);
      return;
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, button_color, button_text_color, slug')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return;
    }

    const user = booking.clerk_users as unknown as { email: string; first_name: string | null; last_name: string | null } | null;
    const instance = booking.session_instances as unknown as {
      id: string;
      start_time: string;
      end_time: string;
      template_id: string;
      session_templates: {
        id: string;
        name: string;
        duration_minutes: number;
        image_url: string | null;
        event_color: string | null;
        booking_instructions: string | null;
        timezone: string;
      } | null;
    } | null;

    if (!user || !instance || !instance.session_templates) {
      console.error('[sendBookingConfirmationEmail] Missing related data for booking:', bookingId);
      return;
    }

    const sessionTemplate = instance.session_templates;
    const timezone = sessionTemplate.timezone || 'Europe/London';
    const startTime = new Date(instance.start_time);
    const endTime = new Date(instance.end_time);

    const dateStr = formatInTimeZone(startTime, timezone, 'EEEE d MMMM yyyy');
    const timeStr = formatInTimeZone(startTime, timezone, 'HH:mm');
    const endTimeStr = formatInTimeZone(endTime, timezone, 'HH:mm');
    const durationStr = `${sessionTemplate.duration_minutes} min`;
    const amountStr = booking.amount_paid != null
      ? `£${(booking.amount_paid / 100).toFixed(2)}`
      : 'Free';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bookasession.org';
    const bookingLink = `${appUrl}/${org.slug}/${sessionTemplate.id}?edit=true&bookingId=${booking.id}&start=${encodeURIComponent(instance.start_time)}`;

    const brandColor = org.button_color || '#6c47ff';
    const brandTextColor = org.button_text_color || '#ffffff';
    const eventColor = sessionTemplate.event_color || brandColor;

    const gcalStart = formatInTimeZone(startTime, 'UTC', "yyyyMMdd'T'HHmmss") + 'Z';
    const gcalEnd = formatInTimeZone(endTime, 'UTC', "yyyyMMdd'T'HHmmss") + 'Z';
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(sessionTemplate.name)}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent(`View booking: ${bookingLink}`)}`;

    const firstName = user.first_name || 'there';
    const renderedContent = renderTemplate(template.content, {
      first_name: firstName,
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const sessionImageHtml = sessionTemplate.image_url
      ? `<tr><td style="padding:0"><img src="${sessionTemplate.image_url}" alt="${escapeHtml(sessionTemplate.name)}" style="width:100%;max-height:200px;object-fit:cover;display:block" /></td></tr>`
      : '';

    const instructionsHtml = sessionTemplate.booking_instructions
      ? `<tr>
          <td style="padding:16px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
            <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Important Information</p>
            <p style="margin:0;font-size:14px;color:#444;white-space:pre-wrap">${escapeHtml(sessionTemplate.booking_instructions)}</p>
          </td>
        </tr>`
      : '';

    const bookingDetailsCard = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        ${sessionImageHtml}
        <tr>
          <td style="padding:20px 20px 4px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:8px">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${eventColor}"></span>
                </td>
                <td style="vertical-align:middle">
                  <span style="font-size:17px;font-weight:600;color:#111">${escapeHtml(sessionTemplate.name)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 20px 16px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${buildDetailRow('Date', dateStr)}
              ${buildDetailRow('Time', `${timeStr} – ${endTimeStr}`)}
              ${buildDetailRow('Duration', durationStr)}
              ${buildDetailRow('Spots booked', String(booking.number_of_spots))}
              ${buildDetailRow('Total', amountStr)}
            </table>
          </td>
        </tr>
        ${instructionsHtml}
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
      <tr>
        <td width="50%" style="padding:0 6px 0 0">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:6px;background:${brandColor}">
                <a href="${bookingLink}" style="display:block;padding:12px 16px;color:${brandTextColor};font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;text-align:center">Manage Booking</a>
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" style="padding:0 0 0 6px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:6px;background:#f4f4f5">
                <a href="${gcalUrl}" style="display:block;padding:12px 16px;color:#333;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;text-align:center">Add to Calendar</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    `;

    const body = `
      <div style="font-size:15px;line-height:1.6;color:#333">
        ${renderedContent}
      </div>
      ${bookingDetailsCard}
    `;

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url,
      brandColor,
      brandTextColor,
      body,
    });

    const subject = renderTemplate(template.subject, {
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const fromAddress = `${org.name} <${process.env.RESEND_FROM_EMAIL ?? 'notifications@bookasession.org'}>`;

    await sendEmail({
      from: fromAddress,
      to: user.email,
      subject,
      html,
      replyTo: template.reply_to,
      idempotencyKey: `booking-confirmation/${bookingId}`,
    });
  } catch (err) {
    console.error('[sendBookingConfirmationEmail] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Membership confirmation
// ---------------------------------------------------------------------------

export async function sendMembershipConfirmationEmail(
  userId: string,
  organizationId: string,
  subscriptionId: string
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: template } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'membership_confirmation')
      .single();

    if (!template || !template.is_active) {
      return;
    }

    const { data: user } = await supabase
      .from('clerk_users')
      .select('email, first_name')
      .eq('id', userId)
      .single();

    if (!user) {
      console.error('[sendMembershipConfirmationEmail] User not found:', userId);
      return;
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, button_color, button_text_color, slug')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return;
    }

    const { data: membership } = await supabase
      .from('user_memberships')
      .select('current_period_end, membership_id, memberships(name, price, billing_period)')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    const brandColor = org.button_color || '#6c47ff';
    const brandTextColor = org.button_text_color || '#ffffff';

    const firstName = user.first_name || 'there';
    const membershipName = (membership?.memberships as { name?: string } | null)?.name || 'Membership';
    const membershipPrice = (membership?.memberships as { price?: number } | null)?.price;
    const priceStr = membershipPrice != null ? `£${(membershipPrice / 100).toFixed(2)}/month` : '';

    const nextBillingDate = membership?.current_period_end
      ? format(new Date(membership.current_period_end), 'd MMMM yyyy')
      : '';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bookasession.org';
    const accountLink = `${appUrl}/${org.slug}/account`;

    const renderedContent = renderTemplate(template.content, {
      first_name: firstName,
      org_name: org.name,
    });

    const detailsCard = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${buildDetailRow('Membership', membershipName)}
              ${priceStr ? buildDetailRow('Price', priceStr) : ''}
              ${nextBillingDate ? buildDetailRow('Next billing date', nextBillingDate) : ''}
            </table>
          </td>
        </tr>
      </table>
      ${buildCtaButton(accountLink, 'Manage Membership', brandColor, brandTextColor)}
    `;

    const body = `
      <div style="font-size:15px;line-height:1.6;color:#333">
        ${renderedContent}
      </div>
      ${detailsCard}
    `;

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url,
      brandColor,
      brandTextColor,
      body,
    });

    const subject = renderTemplate(template.subject, {
      org_name: org.name,
    });

    const fromAddress = `${org.name} <${process.env.RESEND_FROM_EMAIL ?? 'notifications@bookasession.org'}>`;

    await sendEmail({
      from: fromAddress,
      to: user.email,
      subject,
      html,
      replyTo: template.reply_to,
      idempotencyKey: `membership-confirmation/${subscriptionId}`,
    });
  } catch (err) {
    console.error('[sendMembershipConfirmationEmail] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Booking cancellation
// ---------------------------------------------------------------------------

export async function sendBookingCancellationEmail(
  bookingId: string,
  organizationId: string,
  refunded: boolean
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: template } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'booking_cancellation')
      .single();

    if (!template || !template.is_active) {
      return;
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        amount_paid,
        user_id,
        session_instance_id,
        session_instances (
          id,
          start_time,
          end_time,
          session_templates (
            id,
            name,
            duration_minutes,
            timezone
          )
        ),
        clerk_users (
          email,
          first_name
        )
      `)
      .eq('id', bookingId)
      .single();

    if (!booking) {
      console.error('[sendBookingCancellationEmail] Booking not found:', bookingId);
      return;
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, button_color, button_text_color, slug')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return;
    }

    const user = booking.clerk_users as unknown as { email: string; first_name: string | null } | null;
    const instance = booking.session_instances as unknown as {
      id: string;
      start_time: string;
      end_time: string;
      session_templates: {
        id: string;
        name: string;
        duration_minutes: number;
        timezone: string;
      } | null;
    } | null;

    if (!user || !instance || !instance.session_templates) {
      console.error('[sendBookingCancellationEmail] Missing related data for booking:', bookingId);
      return;
    }

    const sessionTemplate = instance.session_templates;
    const timezone = sessionTemplate.timezone || 'Europe/London';
    const startTime = new Date(instance.start_time);
    const endTime = new Date(instance.end_time);

    const dateStr = formatInTimeZone(startTime, timezone, 'EEEE d MMMM yyyy');
    const timeStr = formatInTimeZone(startTime, timezone, 'HH:mm');
    const endTimeStr = formatInTimeZone(endTime, timezone, 'HH:mm');

    const brandColor = org.button_color || '#6c47ff';
    const brandTextColor = org.button_text_color || '#ffffff';

    const firstName = user.first_name || 'there';
    const renderedContent = renderTemplate(template.content, {
      first_name: firstName,
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const refundHtml = refunded
      ? `<tr>
          <td style="padding:12px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
            <p style="margin:0;font-size:13px;color:#71717a">A refund has been processed and should appear in your account within 5–10 business days.</p>
          </td>
        </tr>`
      : '';

    const detailsCard = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${buildDetailRow('Session', escapeHtml(sessionTemplate.name))}
              ${buildDetailRow('Date', dateStr)}
              ${buildDetailRow('Time', `${timeStr} – ${endTimeStr}`)}
            </table>
          </td>
        </tr>
        ${refundHtml}
      </table>
    `;

    const body = `
      <div style="font-size:15px;line-height:1.6;color:#333">
        ${renderedContent}
      </div>
      ${detailsCard}
    `;

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url,
      brandColor,
      brandTextColor,
      body,
    });

    const subject = renderTemplate(template.subject, {
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const fromAddress = `${org.name} <${process.env.RESEND_FROM_EMAIL ?? 'notifications@bookasession.org'}>`;

    await sendEmail({
      from: fromAddress,
      to: user.email,
      subject,
      html,
      replyTo: template.reply_to,
      idempotencyKey: `booking-cancellation/${bookingId}`,
    });
  } catch (err) {
    console.error('[sendBookingCancellationEmail] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Booking cancellation — admin notification
// ---------------------------------------------------------------------------

export async function sendBookingCancellationNotification(
  bookingId: string,
  organizationId: string,
  refunded: boolean
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: template } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'booking_cancellation_notification')
      .single();

    if (!template || !template.is_active) {
      return;
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, button_color, button_text_color, admin_notification_email')
      .eq('id', organizationId)
      .single();

    if (!org || !org.admin_notification_email) {
      return;
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        amount_paid,
        session_instance_id,
        session_instances (
          id,
          start_time,
          end_time,
          session_templates (
            id,
            name,
            timezone
          )
        ),
        clerk_users (
          email,
          first_name,
          last_name
        )
      `)
      .eq('id', bookingId)
      .single();

    if (!booking) {
      console.error('[sendBookingCancellationNotification] Booking not found:', bookingId);
      return;
    }

    const user = booking.clerk_users as unknown as { email: string; first_name: string | null; last_name: string | null } | null;
    const instance = booking.session_instances as unknown as {
      id: string;
      start_time: string;
      end_time: string;
      session_templates: {
        id: string;
        name: string;
        timezone: string;
      } | null;
    } | null;

    if (!user || !instance || !instance.session_templates) {
      console.error('[sendBookingCancellationNotification] Missing related data for booking:', bookingId);
      return;
    }

    const sessionTemplate = instance.session_templates;
    const timezone = sessionTemplate.timezone || 'Europe/London';
    const startTime = new Date(instance.start_time);
    const endTime = new Date(instance.end_time);

    const dateStr = formatInTimeZone(startTime, timezone, 'EEEE d MMMM yyyy');
    const timeStr = formatInTimeZone(startTime, timezone, 'HH:mm');
    const endTimeStr = formatInTimeZone(endTime, timezone, 'HH:mm');

    const brandColor = org.button_color || '#6c47ff';
    const brandTextColor = org.button_text_color || '#ffffff';

    const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
    const renderedContent = renderTemplate(template.content, {
      user_name: userName,
      user_email: user.email,
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const refundHtml = refunded
      ? `<tr>
          <td style="padding:12px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
            <p style="margin:0;font-size:13px;color:#71717a">A refund has been processed and should appear in their account within 5–10 business days.</p>
          </td>
        </tr>`
      : '';

    const detailsCard = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${buildDetailRow('Session', escapeHtml(sessionTemplate.name))}
              ${buildDetailRow('Date', dateStr)}
              ${buildDetailRow('Time', `${timeStr} – ${endTimeStr}`)}
            </table>
          </td>
        </tr>
        ${refundHtml}
      </table>
    `;

    const body = `
      <div style="font-size:15px;line-height:1.6;color:#333">
        ${renderedContent}
      </div>
      ${detailsCard}
    `;

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url,
      brandColor,
      brandTextColor,
      body,
    });

    const subject = renderTemplate(template.subject, {
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const fromAddress = `${org.name} <${process.env.RESEND_FROM_EMAIL ?? 'notifications@bookasession.org'}>`;

    await sendEmail({
      from: fromAddress,
      to: org.admin_notification_email,
      subject,
      html,
      replyTo: template.reply_to,
      idempotencyKey: `booking-cancellation-notification/${bookingId}`,
    });
  } catch (err) {
    console.error('[sendBookingCancellationNotification] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Session cancellation (admin-initiated — sent to all affected bookings)
// ---------------------------------------------------------------------------

export async function sendSessionCancellationEmail(
  bookingId: string,
  organizationId: string,
  refunded: boolean,
  cancellationReason?: string
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: template } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'session_cancellation')
      .single();

    if (!template || !template.is_active) {
      return;
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        amount_paid,
        user_id,
        session_instance_id,
        session_instances (
          id,
          start_time,
          end_time,
          session_templates (
            id,
            name,
            duration_minutes,
            timezone
          )
        ),
        clerk_users (
          email,
          first_name
        )
      `)
      .eq('id', bookingId)
      .single();

    if (!booking) {
      console.error('[sendSessionCancellationEmail] Booking not found:', bookingId);
      return;
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, button_color, button_text_color')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return;
    }

    const user = booking.clerk_users as unknown as { email: string; first_name: string | null } | null;
    const instance = booking.session_instances as unknown as {
      id: string;
      start_time: string;
      end_time: string;
      session_templates: {
        id: string;
        name: string;
        duration_minutes: number;
        timezone: string;
      } | null;
    } | null;

    if (!user || !instance || !instance.session_templates) {
      console.error('[sendSessionCancellationEmail] Missing related data for booking:', bookingId);
      return;
    }

    const sessionTemplate = instance.session_templates;
    const timezone = sessionTemplate.timezone || 'Europe/London';
    const startTime = new Date(instance.start_time);
    const endTime = new Date(instance.end_time);

    const dateStr = formatInTimeZone(startTime, timezone, 'EEEE d MMMM yyyy');
    const timeStr = formatInTimeZone(startTime, timezone, 'HH:mm');
    const endTimeStr = formatInTimeZone(endTime, timezone, 'HH:mm');

    const brandColor = org.button_color || '#6c47ff';
    const brandTextColor = org.button_text_color || '#ffffff';

    const firstName = user.first_name || 'there';
    const renderedContent = renderTemplate(template.content, {
      first_name: firstName,
      session_name: sessionTemplate.name,
      session_date: dateStr,
      session_time: `${timeStr} – ${endTimeStr}`,
      org_name: org.name,
      cancellation_reason: cancellationReason || '',
    });

    const refundHtml = refunded
      ? `<tr>
          <td style="padding:12px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
            <p style="margin:0;font-size:13px;color:#71717a">A refund has been processed and should appear in your account within 5–10 business days.</p>
          </td>
        </tr>`
      : '';

    const detailsCard = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${buildDetailRow('Session', escapeHtml(sessionTemplate.name))}
              ${buildDetailRow('Date', dateStr)}
              ${buildDetailRow('Time', `${timeStr} – ${endTimeStr}`)}
            </table>
          </td>
        </tr>
        ${refundHtml}
      </table>
    `;

    const body = `
      <div style="font-size:15px;line-height:1.6;color:#333">
        ${renderedContent}
      </div>
      ${detailsCard}
    `;

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url,
      brandColor,
      brandTextColor,
      body,
    });

    const subject = renderTemplate(template.subject, {
      session_name: sessionTemplate.name,
      session_date: dateStr,
      org_name: org.name,
    });

    const fromAddress = `${org.name} <${process.env.RESEND_FROM_EMAIL ?? 'notifications@bookasession.org'}>`;

    await sendEmail({
      from: fromAddress,
      to: user.email,
      subject,
      html,
      replyTo: template.reply_to,
      idempotencyKey: `session-cancellation/${bookingId}`,
    });
  } catch (err) {
    console.error('[sendSessionCancellationEmail] Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Waiting list — spot available notification
// ---------------------------------------------------------------------------

export async function sendWaitingListSpotAvailableEmail(
  entryId: string,
  organizationId: string,
  slug: string
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: template } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'waiting_list')
      .single();

    if (!template || !template.is_active) {
      return;
    }

    const { data: entry } = await supabase
      .from('waiting_list_entries')
      .select(`
        id,
        email,
        first_name,
        session_instance_id,
        session_instances (
          id,
          start_time,
          end_time,
          session_templates (
            id,
            name,
            timezone
          )
        )
      `)
      .eq('id', entryId)
      .single();

    if (!entry) {
      console.error('[sendWaitingListSpotAvailableEmail] Entry not found:', entryId);
      return;
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, button_color, button_text_color')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return;
    }

    const instance = entry.session_instances as unknown as {
      id: string;
      start_time: string;
      end_time: string;
      session_templates: {
        id: string;
        name: string;
        timezone: string;
      } | null;
    } | null;

    if (!instance || !instance.session_templates) {
      console.error('[sendWaitingListSpotAvailableEmail] Missing session data for entry:', entryId);
      return;
    }

    const sessionTemplate = instance.session_templates;
    const timezone = sessionTemplate.timezone || 'Europe/London';
    const startTime = new Date(instance.start_time);
    const endTime = new Date(instance.end_time);

    const dateStr = formatInTimeZone(startTime, timezone, 'EEEE d MMMM yyyy');
    const timeStr = formatInTimeZone(startTime, timezone, 'HH:mm');
    const endTimeStr = formatInTimeZone(endTime, timezone, 'HH:mm');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bookasession.org';
    const bookingUrl = `${appUrl}/${slug}/${sessionTemplate.id}?start=${encodeURIComponent(instance.start_time)}`;

    const brandColor = org.button_color || '#6c47ff';
    const brandTextColor = org.button_text_color || '#ffffff';

    const firstName = entry.first_name || 'there';
    const renderedContent = renderTemplate(template.content, {
      first_name: firstName,
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const detailsCard = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${buildDetailRow('Session', escapeHtml(sessionTemplate.name))}
              ${buildDetailRow('Date', dateStr)}
              ${buildDetailRow('Time', `${timeStr} – ${endTimeStr}`)}
            </table>
          </td>
        </tr>
      </table>
      ${buildCtaButton(bookingUrl, 'Book your spot', brandColor, brandTextColor)}
    `;

    const body = `
      <div style="font-size:15px;line-height:1.6;color:#333">
        ${renderedContent}
      </div>
      ${detailsCard}
    `;

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url,
      brandColor,
      brandTextColor,
      body,
    });

    const subject = renderTemplate(template.subject, {
      session_name: sessionTemplate.name,
      org_name: org.name,
    });

    const fromAddress = `${org.name} <${process.env.RESEND_FROM_EMAIL ?? 'notifications@bookasession.org'}>`;

    await sendEmail({
      from: fromAddress,
      to: entry.email,
      subject,
      html,
      replyTo: template.reply_to,
      idempotencyKey: `waiting-list-notification/${entryId}`,
    });
  } catch (err) {
    console.error('[sendWaitingListSpotAvailableEmail] Error:', err);
  }
}
