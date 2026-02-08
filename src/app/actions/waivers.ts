"use server"

import { auth } from "@clerk/nextjs/server"
import { createSupabaseServerClient } from "@/lib/supabase"
import { headers } from "next/headers"
import type { Waiver, WaiverAgreement, AgreementType } from "@/lib/db/schema"

// ============================================
// TYPES
// ============================================

interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface CreateWaiverParams {
  title: string
  summary?: string
  content: string
  agreementType: AgreementType
  isActive?: boolean
}

export interface UpdateWaiverParams extends Partial<CreateWaiverParams> {
  id: string
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Map snake_case DB response to camelCase Waiver type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbWaiverToWaiver(dbRow: any): Waiver {
  return {
    id: dbRow.id,
    organizationId: dbRow.organization_id,
    title: dbRow.title,
    summary: dbRow.summary,
    content: dbRow.content,
    agreementType: dbRow.agreement_type,
    version: dbRow.version,
    isActive: dbRow.is_active,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbAgreementToAgreement(dbRow: any): WaiverAgreement {
  return {
    id: dbRow.id,
    userId: dbRow.user_id,
    waiverId: dbRow.waiver_id,
    waiverVersion: dbRow.waiver_version,
    agreedAt: dbRow.agreed_at,
    agreementType: dbRow.agreement_type,
    signatureData: dbRow.signature_data,
    ipAddress: dbRow.ip_address,
    userAgent: dbRow.user_agent,
    createdAt: dbRow.created_at,
  }
}

async function getAuthenticatedUser(): Promise<
  | { userId: string; clerkUserId: string; internalUserId: string }
  | { error: string }
> {
  const { userId: clerkUserId } = await auth()

  if (!clerkUserId) {
    return { error: "Unauthorized: Not logged in" }
  }

  const supabase = createSupabaseServerClient()

  const { data: user, error } = await supabase
    .from("clerk_users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .single()

  if (error || !user) {
    return { error: "User not found" }
  }

  return { userId: clerkUserId, clerkUserId, internalUserId: user.id }
}

async function getAuthenticatedAdmin(organizationId?: string): Promise<
  { orgId: string } | { error: string }
> {
  const { userId } = await auth()

  if (!userId) {
    return { error: "Unauthorized: Not logged in" }
  }

  const supabase = createSupabaseServerClient()

  const { data: user, error: userError } = await supabase
    .from("clerk_users")
    .select("id, organization_id, role")
    .eq("clerk_user_id", userId)
    .single()

  if (userError || !user) {
    return { error: "User not found" }
  }

  // Determine which organization to use
  let orgId = organizationId

  if (!orgId) {
    const { getTenantFromHeaders } = await import("@/lib/tenant-utils")
    const tenant = await getTenantFromHeaders()
    orgId = tenant?.organizationId
  }

  if (!orgId) {
    orgId = user.organization_id
  }

  if (!orgId) {
    return { error: "No organization specified" }
  }

  // Check if user has admin access
  const hasAccess =
    user.role === "superadmin" ||
    (user.role === "admin" && user.organization_id === orgId)

  if (!hasAccess) {
    return { error: "Unauthorized: Admin access required" }
  }

  return { orgId }
}

// ============================================
// ADMIN ACTIONS - Waiver CRUD
// ============================================

/**
 * Get all waivers for an organization
 */
export async function getWaivers(
  organizationId?: string
): Promise<ActionResult<Waiver[]>> {
  try {
    const authResult = await getAuthenticatedAdmin(organizationId)
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("waivers")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching waivers:", error)
      return { success: false, error: error.message }
    }

    const waivers = (data || []).map(mapDbWaiverToWaiver)
    return { success: true, data: waivers }
  } catch (error) {
    console.error("Error in getWaivers:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get a single waiver by ID
 */
export async function getWaiverById(
  waiverId: string
): Promise<ActionResult<Waiver>> {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("waivers")
      .select("*")
      .eq("id", waiverId)
      .single()

    if (error) {
      console.error("Error fetching waiver:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: mapDbWaiverToWaiver(data) }
  } catch (error) {
    console.error("Error in getWaiverById:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Create a new waiver
 */
export async function createWaiver(
  params: CreateWaiverParams
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // If this waiver should be active, deactivate all others first
    if (params.isActive) {
      await supabase
        .from("waivers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
    }

    const { data, error } = await supabase
      .from("waivers")
      .insert({
        organization_id: orgId,
        title: params.title,
        summary: params.summary || null,
        content: params.content,
        agreement_type: params.agreementType,
        is_active: params.isActive ?? false,
        version: 1,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error creating waiver:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error("Error in createWaiver:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Update an existing waiver
 * If content changes, increment the version
 */
export async function updateWaiver(
  params: UpdateWaiverParams
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get existing waiver
    const { data: existing, error: existingError } = await supabase
      .from("waivers")
      .select("*")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single()

    if (existingError || !existing) {
      return { success: false, error: "Waiver not found" }
    }

    // If activating, deactivate all other waivers first
    if (params.isActive && !existing.is_active) {
      await supabase
        .from("waivers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .neq("id", params.id)
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (params.title !== undefined) updateData.title = params.title
    if (params.summary !== undefined) updateData.summary = params.summary
    if (params.agreementType !== undefined) updateData.agreement_type = params.agreementType
    if (params.isActive !== undefined) updateData.is_active = params.isActive

    // If content changes, increment version
    if (params.content !== undefined && params.content !== existing.content) {
      updateData.content = params.content
      updateData.version = existing.version + 1
    }

    const { error } = await supabase
      .from("waivers")
      .update(updateData)
      .eq("id", params.id)

    if (error) {
      console.error("Error updating waiver:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateWaiver:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete a waiver (only if no agreements exist)
 */
export async function deleteWaiver(waiverId: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Check if any agreements exist for this waiver
    const { data: agreements, error: agreementsError } = await supabase
      .from("waiver_agreements")
      .select("id")
      .eq("waiver_id", waiverId)
      .limit(1)

    if (agreementsError) {
      console.error("Error checking agreements:", agreementsError)
      return { success: false, error: agreementsError.message }
    }

    if (agreements && agreements.length > 0) {
      return {
        success: false,
        error: "Cannot delete waiver with existing agreements. Deactivate it instead.",
      }
    }

    const { error } = await supabase
      .from("waivers")
      .delete()
      .eq("id", waiverId)
      .eq("organization_id", orgId)

    if (error) {
      console.error("Error deleting waiver:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in deleteWaiver:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Toggle waiver active status
 * When activating, deactivate all other waivers for the org
 */
export async function toggleWaiverActive(
  waiverId: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // If activating, deactivate all other waivers first
    if (isActive) {
      await supabase
        .from("waivers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .neq("id", waiverId)
    }

    // Update the target waiver
    const { error } = await supabase
      .from("waivers")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", waiverId)
      .eq("organization_id", orgId)

    if (error) {
      console.error("Error toggling waiver active:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in toggleWaiverActive:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// PUBLIC/USER ACTIONS
// ============================================

/**
 * Get the active waiver for an organization
 */
export async function getActiveWaiver(
  organizationId: string
): Promise<ActionResult<Waiver | null>> {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("waivers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle()

    if (error) {
      console.error("Error fetching active waiver:", error)
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: true, data: null }
    }

    return { success: true, data: mapDbWaiverToWaiver(data) }
  } catch (error) {
    console.error("Error in getActiveWaiver:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Check if current user has agreed to the active waiver for an organization
 */
export async function checkWaiverAgreement(
  organizationId: string
): Promise<
  ActionResult<{
    hasAgreed: boolean
    waiver: Waiver | null
    agreement: WaiverAgreement | null
  }>
> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    // Get active waiver
    const { data: waiver, error: waiverError } = await supabase
      .from("waivers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle()

    if (waiverError) {
      console.error("Error fetching active waiver:", waiverError)
      return { success: false, error: waiverError.message }
    }

    // No active waiver - user doesn't need to agree
    if (!waiver) {
      return {
        success: true,
        data: { hasAgreed: true, waiver: null, agreement: null },
      }
    }

    // Check if user has agreed to this waiver
    const { data: agreement, error: agreementError } = await supabase
      .from("waiver_agreements")
      .select("*")
      .eq("user_id", authResult.internalUserId)
      .eq("waiver_id", waiver.id)
      .maybeSingle()

    if (agreementError) {
      console.error("Error fetching waiver agreement:", agreementError)
      return { success: false, error: agreementError.message }
    }

    const mappedWaiver = mapDbWaiverToWaiver(waiver)
    const mappedAgreement = agreement ? mapDbAgreementToAgreement(agreement) : null

    return {
      success: true,
      data: {
        hasAgreed: !!agreement,
        waiver: mappedWaiver,
        agreement: mappedAgreement,
      },
    }
  } catch (error) {
    console.error("Error in checkWaiverAgreement:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Record user agreement to a waiver
 */
export async function createWaiverAgreement(params: {
  waiverId: string
  agreementType: AgreementType
  signatureData?: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()
    const headersList = await headers()

    // Get waiver to capture version
    const { data: waiver, error: waiverError } = await supabase
      .from("waivers")
      .select("version, agreement_type")
      .eq("id", params.waiverId)
      .single()

    if (waiverError || !waiver) {
      return { success: false, error: "Waiver not found" }
    }

    // Validate signature data if signature type
    if (waiver.agreement_type === "signature" && !params.signatureData) {
      return { success: false, error: "Signature required" }
    }

    // Check if agreement already exists
    const { data: existingAgreement } = await supabase
      .from("waiver_agreements")
      .select("id")
      .eq("user_id", authResult.internalUserId)
      .eq("waiver_id", params.waiverId)
      .maybeSingle()

    if (existingAgreement) {
      // Already agreed - return existing ID
      return { success: true, data: { id: existingAgreement.id } }
    }

    const { data, error } = await supabase
      .from("waiver_agreements")
      .insert({
        user_id: authResult.internalUserId,
        waiver_id: params.waiverId,
        waiver_version: waiver.version,
        agreement_type: params.agreementType,
        signature_data: params.signatureData || null,
        ip_address:
          headersList.get("x-forwarded-for")?.split(",")[0] ||
          headersList.get("x-real-ip") ||
          null,
        user_agent: headersList.get("user-agent") || null,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error creating waiver agreement:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error("Error in createWaiverAgreement:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Record a guest user's agreement to a waiver.
 * Does NOT require Clerk auth. Creates a guest user record if one doesn't exist.
 */
export async function createGuestWaiverAgreement(params: {
  email: string
  organizationId: string
  waiverId: string
  agreementType: AgreementType
  signatureData?: string
}): Promise<ActionResult<{ id: string; userId: string }>> {
  try {
    const supabase = createSupabaseServerClient()
    const headersList = await headers()
    const email = params.email.toLowerCase().trim()

    // Get waiver to capture version
    const { data: waiver, error: waiverError } = await supabase
      .from("waivers")
      .select("version, agreement_type")
      .eq("id", params.waiverId)
      .single()

    if (waiverError || !waiver) {
      return { success: false, error: "Waiver not found" }
    }

    // Validate signature data if signature type
    if (waiver.agreement_type === "signature" && !params.signatureData) {
      return { success: false, error: "Signature required" }
    }

    // Find or create the guest user
    let internalUserId: string

    const { data: existingUser } = await supabase
      .from("clerk_users")
      .select("id, clerk_user_id")
      .eq("email", email)
      .maybeSingle()

    if (existingUser) {
      // If this is a registered (non-guest) user, they should sign in instead
      if (!existingUser.clerk_user_id.startsWith("guest_")) {
        return {
          success: false,
          error: "An account with this email exists. Please sign in.",
        }
      }
      internalUserId = existingUser.id
    } else {
      // Create a new guest user
      const { data: guestUser, error: guestError } = await supabase
        .from("clerk_users")
        .insert({
          clerk_user_id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
          email,
          organization_id: params.organizationId,
        })
        .select("id")
        .single()

      if (guestError || !guestUser) {
        console.error("Error creating guest user for waiver:", guestError)
        return { success: false, error: "Failed to create guest user" }
      }
      internalUserId = guestUser.id
    }

    // Check if agreement already exists
    const { data: existingAgreement } = await supabase
      .from("waiver_agreements")
      .select("id")
      .eq("user_id", internalUserId)
      .eq("waiver_id", params.waiverId)
      .maybeSingle()

    if (existingAgreement) {
      return { success: true, data: { id: existingAgreement.id, userId: internalUserId } }
    }

    // Create the agreement
    const { data, error } = await supabase
      .from("waiver_agreements")
      .insert({
        user_id: internalUserId,
        waiver_id: params.waiverId,
        waiver_version: waiver.version,
        agreement_type: params.agreementType,
        signature_data: params.signatureData || null,
        ip_address:
          headersList.get("x-forwarded-for")?.split(",")[0] ||
          headersList.get("x-real-ip") ||
          null,
        user_agent: headersList.get("user-agent") || null,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error creating guest waiver agreement:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: { id: data.id, userId: internalUserId } }
  } catch (error) {
    console.error("Error in createGuestWaiverAgreement:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
