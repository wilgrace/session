"use server"

import { auth } from "@clerk/nextjs/server"
import { createSupabaseServerClient } from "@/lib/supabase"
import type {
  PriceOption,
  SessionPriceOption,
  InstancePriceOption,
  InstanceMembershipOverride,
} from "@/lib/db/schema"
import { resolvePriceOptions, resolveInstanceCapacity } from "@/lib/pricing-utils"
import type { ResolvedPriceOption } from "@/lib/pricing-utils"

// ============================================
// TYPES
// ============================================

interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface CreatePriceOptionParams {
  name: string
  description?: string
  price: number        // in pence
  spaces: number       // capacity slots consumed per booking (≥ 1)
  includeInFilter?: boolean
  isActive?: boolean
}

export interface UpdatePriceOptionParams extends Partial<CreatePriceOptionParams> {
  id: string
}

export interface SessionPriceOptionInput {
  priceOptionId: string
  isEnabled: boolean
  overridePrice?: number | null   // null = use option default
  overrideSpaces?: number | null  // null = use option default
}

export interface InstancePriceOptionInput {
  priceOptionId: string
  isEnabled: boolean | null  // null = inherit from template
  overridePrice?: number | null
  overrideSpaces?: number | null
}

export interface InstanceMembershipOverrideInput {
  membershipId: string
  isEnabled: boolean | null  // null = inherit from template
  overridePrice?: number | null
}

export interface InstanceOverrides {
  capacityOverride: number | null
  priceOptions: InstancePriceOption[]
  membershipOverrides: InstanceMembershipOverride[]
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbPriceOption(row: any): PriceOption {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    price: row.price,
    spaces: row.spaces,
    includeInFilter: row.include_in_filter,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbSessionPriceOption(row: any): SessionPriceOption {
  return {
    id: row.id,
    sessionTemplateId: row.session_template_id,
    priceOptionId: row.price_option_id,
    isEnabled: row.is_enabled,
    overridePrice: row.override_price,
    overrideSpaces: row.override_spaces,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbInstancePriceOption(row: any): InstancePriceOption {
  return {
    id: row.id,
    sessionInstanceId: row.session_instance_id,
    priceOptionId: row.price_option_id,
    isEnabled: row.is_enabled,
    overridePrice: row.override_price,
    overrideSpaces: row.override_spaces,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbInstanceMembershipOverride(row: any): InstanceMembershipOverride {
  return {
    id: row.id,
    sessionInstanceId: row.session_instance_id,
    membershipId: row.membership_id,
    isEnabled: row.is_enabled,
    overridePrice: row.override_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getAuthenticatedAdmin(
  organizationId?: string
): Promise<{ orgId: string } | { error: string }> {
  const { userId } = await auth()
  if (!userId) return { error: "Unauthorized: Not logged in" }

  const supabase = createSupabaseServerClient()

  const { data: user, error: userError } = await supabase
    .from("clerk_users")
    .select("id, organization_id, role")
    .eq("clerk_user_id", userId)
    .single()

  if (userError || !user) return { error: "User not found" }

  let orgId = organizationId

  if (!orgId) {
    const { getTenantFromHeaders } = await import("@/lib/tenant-utils")
    const tenant = await getTenantFromHeaders()
    orgId = tenant?.organizationId
  }

  if (!orgId) orgId = user.organization_id
  if (!orgId) return { error: "No organization specified" }

  const hasAccess =
    user.role === "superadmin" ||
    (user.role === "admin" && user.organization_id === orgId)

  if (!hasAccess) return { error: "Unauthorized: Admin access required" }

  return { orgId }
}

// ============================================
// ADMIN ACTIONS — Price Option CRUD
// ============================================

export async function getPriceOptions(
  organizationId?: string
): Promise<ActionResult<PriceOption[]>> {
  try {
    const authResult = await getAuthenticatedAdmin(organizationId)
    if ("error" in authResult) return { success: false, error: authResult.error }

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("price_options")
      .select("*")
      .eq("organization_id", authResult.orgId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data || []).map(mapDbPriceOption) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function createPriceOption(
  params: CreatePriceOptionParams
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) return { success: false, error: authResult.error }

    const supabase = createSupabaseServerClient()

    // Get next sort order
    const { data: maxSort } = await supabase
      .from("price_options")
      .select("sort_order")
      .eq("organization_id", authResult.orgId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()

    const sortOrder = (maxSort?.sort_order ?? -1) + 1

    const { data, error } = await supabase
      .from("price_options")
      .insert({
        organization_id: authResult.orgId,
        name: params.name,
        description: params.description || null,
        price: params.price,
        spaces: params.spaces,
        include_in_filter: params.includeInFilter ?? false,
        is_active: params.isActive ?? true,
        sort_order: sortOrder,
      })
      .select("id")
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: { id: data.id } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function updatePriceOption(
  params: UpdatePriceOptionParams
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) return { success: false, error: authResult.error }

    const supabase = createSupabaseServerClient()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (params.name !== undefined) updates.name = params.name
    if (params.description !== undefined) updates.description = params.description
    if (params.price !== undefined) updates.price = params.price
    if (params.spaces !== undefined) updates.spaces = params.spaces
    if (params.includeInFilter !== undefined) updates.include_in_filter = params.includeInFilter
    if (params.isActive !== undefined) updates.is_active = params.isActive

    const { error } = await supabase
      .from("price_options")
      .update(updates)
      .eq("id", params.id)
      .eq("organization_id", authResult.orgId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function deletePriceOption(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) return { success: false, error: authResult.error }

    const supabase = createSupabaseServerClient()

    // Check for bookings referencing this option
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("price_option_id", id)

    if (count && count > 0) {
      return {
        success: false,
        error: "Cannot delete: this price option has associated bookings. Deactivate it instead.",
      }
    }

    const { error } = await supabase
      .from("price_options")
      .delete()
      .eq("id", id)
      .eq("organization_id", authResult.orgId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function reorderPriceOptions(ids: string[]): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) return { success: false, error: authResult.error }

    const supabase = createSupabaseServerClient()

    const updates = ids.map((id, index) =>
      supabase
        .from("price_options")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("organization_id", authResult.orgId)
    )

    await Promise.all(updates)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// ============================================
// ADMIN ACTIONS — Template-level price options
// ============================================

export async function getSessionPriceOptions(
  sessionTemplateId: string
): Promise<ActionResult<SessionPriceOption[]>> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("session_price_options")
      .select("*")
      .eq("session_template_id", sessionTemplateId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data || []).map(mapDbSessionPriceOption) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Upsert session price option settings for a template.
 * Rows not present in `inputs` are deleted (i.e. option reverts to "not configured").
 */
export async function updateSessionPriceOptions(
  sessionTemplateId: string,
  inputs: SessionPriceOptionInput[]
): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient()

    // Delete existing rows for this template
    await supabase
      .from("session_price_options")
      .delete()
      .eq("session_template_id", sessionTemplateId)

    if (inputs.length === 0) return { success: true }

    const rows = inputs.map((input) => ({
      session_template_id: sessionTemplateId,
      price_option_id: input.priceOptionId,
      is_enabled: input.isEnabled,
      override_price: input.overridePrice ?? null,
      override_spaces: input.overrideSpaces ?? null,
    }))

    const { error } = await supabase.from("session_price_options").insert(rows)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// ============================================
// ADMIN ACTIONS — Instance-level overrides
// ============================================

export async function getInstanceOverrides(
  sessionInstanceId: string
): Promise<ActionResult<InstanceOverrides>> {
  try {
    const supabase = createSupabaseServerClient()

    const [instanceResult, priceOptResult, membershipResult] = await Promise.all([
      supabase
        .from("session_instances")
        .select("capacity_override")
        .eq("id", sessionInstanceId)
        .single(),
      supabase
        .from("instance_price_options")
        .select("*")
        .eq("session_instance_id", sessionInstanceId),
      supabase
        .from("instance_membership_overrides")
        .select("*")
        .eq("session_instance_id", sessionInstanceId),
    ])

    if (instanceResult.error) return { success: false, error: instanceResult.error.message }

    return {
      success: true,
      data: {
        capacityOverride: instanceResult.data?.capacity_override ?? null,
        priceOptions: (priceOptResult.data || []).map(mapDbInstancePriceOption),
        membershipOverrides: (membershipResult.data || []).map(mapDbInstanceMembershipOverride),
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function updateInstanceCapacity(
  sessionInstanceId: string,
  capacityOverride: number | null
): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase
      .from("session_instances")
      .update({ capacity_override: capacityOverride })
      .eq("id", sessionInstanceId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Upsert instance-level price option overrides.
 * Only rows in `inputs` are written; unmentioned options inherit from template.
 */
export async function updateInstancePriceOptions(
  sessionInstanceId: string,
  inputs: InstancePriceOptionInput[]
): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient()

    // Delete existing rows
    await supabase
      .from("instance_price_options")
      .delete()
      .eq("session_instance_id", sessionInstanceId)

    if (inputs.length === 0) return { success: true }

    const rows = inputs.map((input) => ({
      session_instance_id: sessionInstanceId,
      price_option_id: input.priceOptionId,
      is_enabled: input.isEnabled,
      override_price: input.overridePrice ?? null,
      override_spaces: input.overrideSpaces ?? null,
    }))

    const { error } = await supabase.from("instance_price_options").insert(rows)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Upsert instance-level membership overrides.
 * Only rows in `inputs` are written; unmentioned memberships inherit from template.
 */
export async function updateInstanceMembershipOverrides(
  sessionInstanceId: string,
  inputs: InstanceMembershipOverrideInput[]
): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient()

    await supabase
      .from("instance_membership_overrides")
      .delete()
      .eq("session_instance_id", sessionInstanceId)

    if (inputs.length === 0) return { success: true }

    const rows = inputs.map((input) => ({
      session_instance_id: sessionInstanceId,
      membership_id: input.membershipId,
      is_enabled: input.isEnabled,
      override_price: input.overridePrice ?? null,
    }))

    const { error } = await supabase.from("instance_membership_overrides").insert(rows)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// ============================================
// PUBLIC ACTION — Booking page price resolution
// ============================================

export interface BookingPriceOptionsData {
  resolvedPriceOptions: ResolvedPriceOption[]
  spotsRemaining: number
}

/**
 * Resolve available price options for a session instance.
 * Returns only options the user can actually select (enabled + sufficient capacity).
 * Used by the booking page server component.
 */
export async function getBookingPriceOptionsData(params: {
  organizationId: string
  sessionTemplateId: string
  sessionInstanceId: string
}): Promise<ActionResult<BookingPriceOptionsData>> {
  try {
    const supabase = createSupabaseServerClient()

    const [orgOptionsResult, sessionOptionsResult, instanceOptionsResult, instanceResult, bookingsResult, scheduleResult] =
      await Promise.all([
        // All active org price options
        supabase
          .from("price_options")
          .select("*")
          .eq("organization_id", params.organizationId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),

        // Template-level overrides
        supabase
          .from("session_price_options")
          .select("*")
          .eq("session_template_id", params.sessionTemplateId),

        // Instance-level overrides
        supabase
          .from("instance_price_options")
          .select("*")
          .eq("session_instance_id", params.sessionInstanceId),

        // Instance row (for capacity_override and schedule_id)
        supabase
          .from("session_instances")
          .select("capacity_override, schedule_id, template_id")
          .eq("id", params.sessionInstanceId)
          .single(),

        // Total spots booked for this instance (confirmed / pending_payment)
        supabase
          .from("bookings")
          .select("number_of_spots")
          .eq("session_instance_id", params.sessionInstanceId)
          .in("status", ["confirmed", "pending_payment"])
          .is("cancelled_at", null),

        // Template capacity + schedule capacity
        supabase
          .from("session_templates")
          .select("capacity, session_schedules(capacity)")
          .eq("id", params.sessionTemplateId)
          .single(),
      ])

    if (instanceResult.error) return { success: false, error: instanceResult.error.message }
    if (scheduleResult.error) return { success: false, error: scheduleResult.error.message }

    const templateCapacity: number = (scheduleResult.data as { capacity: number; session_schedules: { capacity: number | null }[] })?.capacity ?? 0
    // Find the schedule capacity matching this instance's schedule_id
    const schedules = (scheduleResult.data as { session_schedules: { capacity: number | null }[] })?.session_schedules ?? []
    const scheduleCapacity: number | null = schedules[0]?.capacity ?? null

    const effectiveCapacity = resolveInstanceCapacity({
      templateCapacity,
      scheduleCapacity,
      instanceCapacityOverride: instanceResult.data?.capacity_override ?? null,
    })

    const totalBooked = (bookingsResult.data || []).reduce(
      (sum, b) => sum + (b.number_of_spots ?? 1),
      0
    )
    const spotsRemaining = Math.max(0, effectiveCapacity - totalBooked)

    const orgPriceOptions = (orgOptionsResult.data || []).map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      description: r.description,
      price: r.price,
      spaces: r.spaces,
      includeInFilter: r.include_in_filter,
      isActive: r.is_active,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))

    const sessionOverrides = (sessionOptionsResult.data || []).map(mapDbSessionPriceOption)
    const instanceOverrides = (instanceOptionsResult.data || []).map(mapDbInstancePriceOption)

    const resolvedPriceOptions = resolvePriceOptions({
      orgPriceOptions,
      sessionOverrides,
      instanceOverrides,
      spotsRemaining,
    })

    return {
      success: true,
      data: { resolvedPriceOptions, spotsRemaining },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Get org price options for public display (no auth required).
 * Used to populate calendar filters.
 */
export async function getPublicPriceOptions(
  organizationId: string
): Promise<ActionResult<PriceOption[]>> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("price_options")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: (data || []).map(mapDbPriceOption) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}
