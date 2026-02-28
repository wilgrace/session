/**
 * Pure HTML email builders — no server-side imports.
 * Safe to use in both client and server components.
 */

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

/** Replace {{variable}} placeholders with actual values */
export function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildOutlineCtaButton(href: string, label: string, brandColor: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:12px auto 0">
    <tr>
      <td style="border-radius:6px;border:2px solid ${brandColor}">
        <a href="${href}" style="display:inline-block;padding:10px 28px;color:${brandColor};font-size:15px;font-weight:600;text-decoration:none;border-radius:6px">${label}</a>
      </td>
    </tr>
  </table>`;
}

export function buildCtaButton(href: string, label: string, brandColor: string, brandTextColor: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0">
    <tr>
      <td style="border-radius:6px;background:${brandColor}">
        <a href="${href}" style="display:inline-block;padding:12px 28px;color:${brandTextColor};font-size:15px;font-weight:600;text-decoration:none;border-radius:6px">${label}</a>
      </td>
    </tr>
  </table>`;
}

export function buildDetailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;vertical-align:top">
      <p style="margin:0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">${label}</p>
      <p style="margin:4px 0 0;font-size:15px;color:#111;font-weight:500">${value}</p>
    </td>
  </tr>`;
}

export function buildEmailWrapper({
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
  body,
}: {
  orgName: string;
  orgLogoUrl: string | null;
  brandColor: string;
  brandTextColor: string;
  body: string;
}): string {
  const logoHtml = orgLogoUrl
    ? `<img src="${orgLogoUrl}" alt="${escapeHtml(orgName)}" style="max-height:80px;max-width:260px;object-fit:contain;display:block;margin:0 auto 12px" />`
    : `<p style="margin:0;font-size:18px;font-weight:700;color:#111;text-align:center">${escapeHtml(orgName)}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Email from ${escapeHtml(orgName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e4e7">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #f0f0f0">
              ${logoHtml}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center">
              <p style="margin:0;font-size:12px;color:#a1a1aa">${escapeHtml(orgName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Preview builders (sample data, for admin preview modal)
// ---------------------------------------------------------------------------

export function buildBookingConfirmationPreview({
  templateContent,
  templateSubject: _templateSubject,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: {
  templateContent: string;
  templateSubject: string;
  orgName: string;
  orgLogoUrl: string | null;
  brandColor: string;
  brandTextColor: string;
}): string {
  const sampleVars: Record<string, string> = {
    first_name: 'Alex',
    session_name: 'Hot Sauna Session',
    org_name: orgName,
  };

  const renderedContent = renderTemplate(templateContent, sampleVars);
  const eventColor = brandColor;

  const bookingDetailsCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:0;background:#e4e4e7;height:160px;text-align:center;vertical-align:middle">
          <span style="color:#a1a1aa;font-size:13px">Session image</span>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 20px 4px">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;padding-right:8px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${eventColor}"></span>
              </td>
              <td style="vertical-align:middle">
                <span style="font-size:17px;font-weight:600;color:#111">Hot Sauna Session</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 20px 16px">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${buildDetailRow('Date', 'Saturday 15 March 2026')}
            ${buildDetailRow('Time', '14:00 – 15:00')}
            ${buildDetailRow('Duration', '60 min')}
            ${buildDetailRow('Spots booked', '2')}
            ${buildDetailRow('Total', '£20.00')}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
          <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Important Information</p>
          <p style="margin:0;font-size:14px;color:#444">Please arrive 5 minutes early. Bring a towel and water.</p>
        </td>
      </tr>
    </table>
    ${buildCtaButton('#', 'View Booking', brandColor, brandTextColor)}
    ${buildOutlineCtaButton('#', 'Add to Calendar', brandColor)}
  `;

  const body = `
    <div style="font-size:15px;line-height:1.6;color:#333">
      ${renderedContent}
    </div>
    ${bookingDetailsCard}
  `;

  return buildEmailWrapper({ orgName, orgLogoUrl, brandColor, brandTextColor, body });
}

export function buildMembershipConfirmationPreview({
  templateContent,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: {
  templateContent: string;
  orgName: string;
  orgLogoUrl: string | null;
  brandColor: string;
  brandTextColor: string;
}): string {
  const sampleVars: Record<string, string> = {
    first_name: 'Alex',
    org_name: orgName,
  };

  const renderedContent = renderTemplate(templateContent, sampleVars);

  const detailsCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:16px 20px">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${buildDetailRow('Membership', 'Monthly Membership')}
            ${buildDetailRow('Price', '£15.00/month')}
            ${buildDetailRow('Next billing date', '15 March 2026')}
          </table>
        </td>
      </tr>
    </table>
    ${buildCtaButton('#', 'Manage Membership', brandColor, brandTextColor)}
  `;

  const body = `
    <div style="font-size:15px;line-height:1.6;color:#333">
      ${renderedContent}
    </div>
    ${detailsCard}
  `;

  return buildEmailWrapper({ orgName, orgLogoUrl, brandColor, brandTextColor, body });
}

export function buildWaitingListPreview({
  templateContent,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: {
  templateContent: string;
  orgName: string;
  orgLogoUrl: string | null;
  brandColor: string;
  brandTextColor: string;
}): string {
  const sampleVars: Record<string, string> = {
    first_name: 'Alex',
    session_name: 'Hot Sauna Session',
    org_name: orgName,
  };

  const renderedContent = renderTemplate(templateContent, sampleVars);

  const detailsCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:16px 20px">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${buildDetailRow('Session', 'Hot Sauna Session')}
            ${buildDetailRow('Date', 'Saturday 15 March 2026')}
            ${buildDetailRow('Time', '14:00')}
          </table>
        </td>
      </tr>
    </table>
  `;

  const body = `
    <div style="font-size:15px;line-height:1.6;color:#333">
      ${renderedContent}
    </div>
    ${detailsCard}
  `;

  return buildEmailWrapper({ orgName, orgLogoUrl, brandColor, brandTextColor, body });
}

export function buildBookingCancellationPreview({
  templateContent,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: {
  templateContent: string;
  orgName: string;
  orgLogoUrl: string | null;
  brandColor: string;
  brandTextColor: string;
}): string {
  const sampleVars: Record<string, string> = {
    first_name: 'Alex',
    session_name: 'Hot Sauna Session',
    org_name: orgName,
  };

  const renderedContent = renderTemplate(templateContent, sampleVars);

  const detailsCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:16px 20px">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${buildDetailRow('Session', 'Hot Sauna Session')}
            ${buildDetailRow('Date', 'Saturday 15 March 2026')}
            ${buildDetailRow('Time', '14:00 – 15:00')}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
          <p style="margin:0;font-size:13px;color:#71717a">A refund has been processed and should appear in your account within 5–10 business days.</p>
        </td>
      </tr>
    </table>
  `;

  const body = `
    <div style="font-size:15px;line-height:1.6;color:#333">
      ${renderedContent}
    </div>
    ${detailsCard}
  `;

  return buildEmailWrapper({ orgName, orgLogoUrl, brandColor, brandTextColor, body });
}

export function buildBookingCancellationNotificationPreview({
  templateContent,
  orgName,
  orgLogoUrl,
  brandColor,
  brandTextColor,
}: {
  templateContent: string;
  orgName: string;
  orgLogoUrl: string | null;
  brandColor: string;
  brandTextColor: string;
}): string {
  const sampleVars: Record<string, string> = {
    user_name: 'Alex Johnson',
    user_email: 'alex@example.com',
    session_name: 'Hot Sauna Session',
    org_name: orgName,
  };

  const renderedContent = renderTemplate(templateContent, sampleVars);

  const detailsCard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:16px 20px">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${buildDetailRow('Session', 'Hot Sauna Session')}
            ${buildDetailRow('Date', 'Saturday 15 March 2026')}
            ${buildDetailRow('Time', '14:00 – 15:00')}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;background:#fafafa;border-top:1px solid #f0f0f0">
          <p style="margin:0;font-size:13px;color:#71717a">A refund has been processed and should appear in their account within 5–10 business days.</p>
        </td>
      </tr>
    </table>
  `;

  const body = `
    <div style="font-size:15px;line-height:1.6;color:#333">
      ${renderedContent}
    </div>
    ${detailsCard}
  `;

  return buildEmailWrapper({ orgName, orgLogoUrl, brandColor, brandTextColor, body });
}
