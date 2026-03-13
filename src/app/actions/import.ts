"use server"

import { auth } from "@clerk/nextjs/server"
import { createSupabaseServerClient } from "@/lib/supabase"
import { requireTenantFromHeaders, getUserRoleForOrg } from "@/lib/tenant-utils"
import { sendEmail } from "@/lib/email"
import { buildEmailWrapper, buildCtaButton, buildDetailRow, escapeHtml } from "@/lib/email-html"
import { formatInTimeZone } from "date-fns-tz"
import { parseISO } from "date-fns"
import type { AcuityRow } from "@/lib/acuity-csv"
import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionInstanceForMapping {
  id: string
  startTime: string   // ISO UTC
  endTime: string     // ISO UTC
  templateId: string
  templateName: string
  timezone: string
}

export interface ImportSummary {
  bookingsCreated: number
  bookingsSkipped: number
  usersCreated: number
  usersMatched: number
  emailsSent: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Fetch existing session instances for the mapping step
// ---------------------------------------------------------------------------

export async function getSessionInstancesForImport(): Promise<{
  success: boolean
  data?: SessionInstanceForMapping[]
  error?: string
}> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }

    const tenant = await requireTenantFromHeaders()
    const role = await getUserRoleForOrg(userId, tenant.organizationId)
    if (!role) return { success: false, error: "Unauthorized" }

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("session_instances")
      .select(`
        id,
        start_time,
        end_time,
        template_id,
        session_templates!inner(name, timezone)
      `)
      .eq("organization_id", tenant.organizationId)
      .eq("status", "scheduled")
      .order("start_time", { ascending: true })

    if (error) throw error

    const instances: SessionInstanceForMapping[] = (data ?? []).map((row: any) => ({
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time,
      templateId: row.template_id,
      templateName: row.session_templates?.name ?? "Unknown",
      timezone: row.session_templates?.timezone ?? "Europe/London",
    }))

    return { success: true, data: instances }
  } catch (err: any) {
    console.error("[getSessionInstancesForImport]", err)
    return { success: false, error: err.message ?? "Failed to load sessions" }
  }
}

// ---------------------------------------------------------------------------
// Main import action
// ---------------------------------------------------------------------------

export async function importFromAcuity(params: {
  rows: AcuityRow[]
  slotMapping: Record<string, string>  // slotKey → session_instance.id
  switchDate: string                   // ISO date string (YYYY-MM-DD)
  sendNotifications: boolean
}): Promise<{ success: boolean; summary?: ImportSummary; error?: string }> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }

    const tenant = await requireTenantFromHeaders()
    const role = await getUserRoleForOrg(userId, tenant.organizationId)
    if (!role) return { success: false, error: "Unauthorized" }

    const supabase = createSupabaseServerClient()
    const organizationId = tenant.organizationId
    const { rows, slotMapping, switchDate, sendNotifications } = params

    const summary: ImportSummary = {
      bookingsCreated: 0,
      bookingsSkipped: 0,
      usersCreated: 0,
      usersMatched: 0,
      emailsSent: 0,
      errors: [],
    }

    // 1. Collect unique emails from rows whose slot is mapped
    const mappedRows = rows.filter(r => r.email && slotMapping[r.slotKey])
    const uniqueEmails = [...new Set(mappedRows.map(r => r.email))]

    if (uniqueEmails.length === 0) {
      return { success: true, summary }
    }

    // 2. Look up which emails already have clerk_users records
    const { data: existingUsers, error: lookupErr } = await supabase
      .from("clerk_users")
      .select("id, email")
      .in("email", uniqueEmails)

    if (lookupErr) throw lookupErr

    const userIdByEmail = new Map<string, string>()
    for (const u of existingUsers ?? []) {
      userIdByEmail.set(u.email, u.id)
    }

    // 3. Create placeholder users for emails not yet in the system
    const newEmails = uniqueEmails.filter(e => !userIdByEmail.has(e))
    for (const email of newEmails) {
      const row = mappedRows.find(r => r.email === email)
      if (!row) continue

      const newId = randomUUID()
      const { error: insertErr } = await supabase.from("clerk_users").insert({
        id: newId,
        email,
        first_name: row.firstName || null,
        last_name: row.lastName || null,
        organization_id: organizationId,
        role: "user",
        migrated_from: "acuity",
        // clerk_user_id intentionally omitted (null) until they sign up
      })

      if (insertErr) {
        summary.errors.push(`Failed to create user ${email}: ${insertErr.message}`)
        continue
      }

      userIdByEmail.set(email, newId)
      summary.usersCreated++
    }
    summary.usersMatched = uniqueEmails.length - newEmails.length

    // 4. Insert bookings
    const createdBookingIds: string[] = []

    for (const row of rows) {
      if (!row.email || !slotMapping[row.slotKey]) {
        summary.bookingsSkipped++
        continue
      }

      const instanceId = slotMapping[row.slotKey]
      const userId = userIdByEmail.get(row.email)
      if (!userId) {
        summary.bookingsSkipped++
        continue
      }

      // Idempotency: skip if this Acuity appointment was already imported
      const acuityNote = `Acuity ID: ${row.appointmentId}`
      const { data: existing } = await supabase
        .from("bookings")
        .select("id")
        .eq("session_instance_id", instanceId)
        .eq("user_id", userId)
        .ilike("notes", `%${acuityNote}%`)
        .maybeSingle()

      if (existing) {
        summary.bookingsSkipped++
        continue
      }

      const amountPaid = Math.round(parseFloat(row.amountPaidOnline || "0") * 100)

      const { data: newBooking, error: bookingErr } = await supabase
        .from("bookings")
        .insert({
          organization_id: organizationId,
          session_instance_id: instanceId,
          user_id: userId,
          status: "confirmed",
          number_of_spots: 1,
          notes: acuityNote,
          payment_status: amountPaid > 0 ? "completed" : "not_required",
          amount_paid: amountPaid > 0 ? amountPaid : null,
        })
        .select("id")
        .single()

      if (bookingErr) {
        // 23505 = unique_violation: same user already has a booking for this instance
        // (can happen when a user appears twice in the CSV for the same slot)
        if ((bookingErr as any).code === "23505") {
          summary.bookingsSkipped++
        } else {
          summary.errors.push(`Failed to create booking for ${row.email}: ${bookingErr.message}`)
        }
        continue
      }

      summary.bookingsCreated++
      createdBookingIds.push(newBooking.id)
    }

    // 5. Send notification emails
    if (sendNotifications && createdBookingIds.length > 0) {
      const switchDateObj = new Date(switchDate + "T00:00:00Z")
      summary.emailsSent = await sendMigrationNotificationEmails(
        createdBookingIds,
        switchDateObj,
        organizationId,
        supabase,
      )
    }

    return { success: true, summary }
  } catch (err: any) {
    console.error("[importFromAcuity]", err)
    return { success: false, error: err.message ?? "Import failed" }
  }
}

// ---------------------------------------------------------------------------
// Migration notification emails (one per user per session)
// ---------------------------------------------------------------------------

async function sendMigrationNotificationEmails(
  bookingIds: string[],
  switchDate: Date,
  organizationId: string,
  supabase: SupabaseClient,
): Promise<number> {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id,
      user_id,
      session_instances!inner(
        id,
        start_time,
        end_time,
        session_templates!inner(name, timezone)
      ),
      clerk_users!inner(email, first_name)
    `)
    .in("id", bookingIds)

  if (error || !bookings?.length) {
    console.error("[sendMigrationNotificationEmails] fetch error:", error)
    return 0
  }

  // Filter to sessions on/after the switch date
  const upcomingBookings = bookings.filter((b: any) => {
    const start = new Date((b.session_instances as any)?.start_time)
    return start >= switchDate
  })

  if (!upcomingBookings.length) return 0

  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug, logo_url, button_color, button_text_color")
    .eq("id", organizationId)
    .single()

  if (!org) return 0

  const fromAddress = `${org.name} <notifications@bookasession.org>`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bookasession.org"

  // Deduplicate: one email per user+instance
  const sent = new Set<string>()
  let emailsSent = 0

  for (const booking of upcomingBookings) {
    const instance = (booking as any).session_instances
    const user = (booking as any).clerk_users
    const template = instance?.session_templates

    if (!instance || !user || !template) continue

    const dedupeKey = `${user.email}|${instance.id}`
    if (sent.has(dedupeKey)) continue
    sent.add(dedupeKey)

    const timezone = template.timezone ?? "Europe/London"
    const startDate = parseISO(instance.start_time)
    const formattedDate = formatInTimeZone(startDate, timezone, "EEEE d MMMM yyyy")
    const formattedTime = formatInTimeZone(startDate, timezone, "HH:mm")
    const sessionUrl = `${appUrl}/${org.slug}/${instance.id}`
    const createAccountUrl = `${appUrl}/${org.slug}`

    const firstName = user.first_name || "there"
    const subject = `Your ${template.name} booking — ${formattedDate}`

    const body = `
      <p style="margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 20px">${escapeHtml(org.name)} has moved to <strong>Session</strong> for bookings. Your booking has been transferred.</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px">
        ${buildDetailRow("Session", escapeHtml(template.name))}
        ${buildDetailRow("Date", formattedDate)}
        ${buildDetailRow("Time", formattedTime)}
      </table>
      ${buildCtaButton(createAccountUrl, "Create your account", org.button_color ?? "#6c47ff", org.button_text_color ?? "#ffffff")}
      <p style="margin-top:20px;font-size:14px;color:#6b7280">
        Create a free account to view and manage your bookings.
        Already have an account?
        <a href="${sessionUrl}" style="color:${org.button_color ?? "#6c47ff"}">View your booking</a>.
      </p>
    `

    const html = buildEmailWrapper({
      orgName: org.name,
      orgLogoUrl: org.logo_url ?? null,
      brandColor: org.button_color ?? "#6c47ff",
      brandTextColor: org.button_text_color ?? "#ffffff",
      body,
    })

    const idempotencyKey = `migration-notification/${instance.id}/${booking.user_id}`
    const result = await sendEmail({
      from: fromAddress,
      to: user.email,
      subject,
      html,
      idempotencyKey,
    })

    if (result.success) emailsSent++
    else console.error("[sendMigrationNotificationEmails] send failed:", result.error)
  }

  return emailsSent
}
