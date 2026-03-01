"use server"

import { auth } from "@clerk/nextjs/server"
import { createSupabaseServerClient } from "@/lib/supabase"
import Stripe from "stripe"
import type { Membership, UserMembership, BillingPeriod } from "@/lib/db/schema"
import { isMembershipActive } from "@/lib/pricing-utils"

// Lazy initialization to avoid build-time errors when env vars aren't available
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
  })
}

// ============================================
// TYPES
// ============================================

interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface CreateMembershipParams {
  name: string
  description?: string
  imageUrl?: string
  price: number // in pence, 0 = free
  billingPeriod: BillingPeriod
  memberPriceType: "discount" | "fixed"
  memberDiscountPercent?: number
  memberFixedPrice?: number // in pence
  displayToNonMembers?: boolean // Deprecated
  showOnBookingPage?: boolean // Deprecated: per-session control now handled in session settings
  showOnMembershipPage: boolean
  isActive?: boolean
}

export interface UpdateMembershipParams extends Partial<CreateMembershipParams> {
  id: string
}

export interface MembershipWithUserStatus extends Membership {
  isUserMembership?: boolean // Whether the current user has this membership
}

export interface SessionMembershipPriceInput {
  membershipId: string
  isEnabled: boolean // Whether this membership is available for this session
  overridePrice?: number | null // in pence; null = use membership default
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Map snake_case DB response to camelCase Membership type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbMembershipToMembership(dbRow: any): Membership {
  return {
    id: dbRow.id,
    organizationId: dbRow.organization_id,
    name: dbRow.name,
    description: dbRow.description,
    imageUrl: dbRow.image_url,
    price: dbRow.price,
    billingPeriod: dbRow.billing_period,
    memberPriceType: dbRow.member_price_type,
    memberDiscountPercent: dbRow.member_discount_percent,
    memberFixedPrice: dbRow.member_fixed_price,
    displayToNonMembers: dbRow.display_to_non_members,
    showOnBookingPage: dbRow.show_on_booking_page ?? dbRow.display_to_non_members,
    showOnMembershipPage: dbRow.show_on_membership_page ?? true,
    stripeProductId: dbRow.stripe_product_id,
    stripePriceId: dbRow.stripe_price_id,
    isActive: dbRow.is_active,
    sortOrder: dbRow.sort_order,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
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
// ADMIN ACTIONS - Membership CRUD
// ============================================

/**
 * Get all memberships for an organization
 */
export async function getMemberships(
  organizationId?: string
): Promise<ActionResult<Membership[]>> {
  try {
    const authResult = await getAuthenticatedAdmin(organizationId)
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Error fetching memberships:", error)
      return { success: false, error: error.message }
    }

    // Map snake_case DB columns to camelCase Membership type
    const memberships = (data || []).map(mapDbMembershipToMembership)
    return { success: true, data: memberships }
  } catch (error) {
    console.error("Error in getMemberships:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get a single membership by ID
 */
export async function getMembershipById(
  membershipId: string
): Promise<ActionResult<Membership>> {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("id", membershipId)
      .single()

    if (error) {
      console.error("Error fetching membership:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: mapDbMembershipToMembership(data) }
  } catch (error) {
    console.error("Error in getMembershipById:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Create a new membership
 */
export async function createMembership(
  params: CreateMembershipParams
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get organization name for Stripe product
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    let stripeProductId: string | null = null
    let stripePriceId: string | null = null

    // Create Stripe product and price for paid memberships
    if (params.price > 0) {
      // Get Stripe Connect account
      const { data: stripeAccount, error: stripeError } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("organization_id", orgId)
        .single()

      if (stripeError || !stripeAccount) {
        return {
          success: false,
          error: "Stripe not connected. Please connect Stripe first.",
        }
      }

      const stripe = getStripe()

      // Create product on Connected Account
      const product = await stripe.products.create(
        {
          name: params.name,
          description: params.description || `${org.name} membership`,
        },
        { stripeAccount: stripeAccount.stripe_account_id }
      )
      stripeProductId = product.id

      // Create price on Connected Account
      const priceParams: Stripe.PriceCreateParams = {
        product: product.id,
        unit_amount: params.price,
        currency: "gbp",
      }

      // Add recurring interval for non-one-time memberships
      if (params.billingPeriod !== "one_time") {
        priceParams.recurring = {
          interval: params.billingPeriod === "monthly" ? "month" : "year",
        }
      }

      const price = await stripe.prices.create(priceParams, {
        stripeAccount: stripeAccount.stripe_account_id,
      })
      stripePriceId = price.id
    }

    // Get max sort_order
    const { data: maxSort } = await supabase
      .from("memberships")
      .select("sort_order")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()

    const sortOrder = (maxSort?.sort_order ?? -1) + 1

    // Insert membership
    const { data, error } = await supabase
      .from("memberships")
      .insert({
        organization_id: orgId,
        name: params.name,
        description: params.description || null,
        image_url: params.imageUrl || null,
        price: params.price,
        billing_period: params.billingPeriod,
        member_price_type: params.memberPriceType,
        member_discount_percent: params.memberDiscountPercent || null,
        member_fixed_price: params.memberFixedPrice || null,
        display_to_non_members: params.showOnBookingPage ?? true, // Backward compat
        show_on_booking_page: params.showOnBookingPage ?? true,
        show_on_membership_page: params.showOnMembershipPage,
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
        is_active: params.isActive ?? true,
        sort_order: sortOrder,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Error creating membership:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error("Error in createMembership:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Update an existing membership
 */
export async function updateMembership(
  params: UpdateMembershipParams
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get existing membership
    const { data: existing, error: existingError } = await supabase
      .from("memberships")
      .select("*")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single()

    if (existingError || !existing) {
      return { success: false, error: "Membership not found" }
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (params.name !== undefined) updateData.name = params.name
    if (params.description !== undefined) updateData.description = params.description
    if (params.imageUrl !== undefined) updateData.image_url = params.imageUrl
    if (params.billingPeriod !== undefined) updateData.billing_period = params.billingPeriod
    if (params.memberPriceType !== undefined) updateData.member_price_type = params.memberPriceType
    if (params.memberDiscountPercent !== undefined) updateData.member_discount_percent = params.memberDiscountPercent
    if (params.memberFixedPrice !== undefined) updateData.member_fixed_price = params.memberFixedPrice
    if (params.displayToNonMembers !== undefined) updateData.display_to_non_members = params.displayToNonMembers
    if (params.showOnBookingPage !== undefined) {
      updateData.show_on_booking_page = params.showOnBookingPage
      updateData.display_to_non_members = params.showOnBookingPage // Backward compat
    }
    if (params.showOnMembershipPage !== undefined) updateData.show_on_membership_page = params.showOnMembershipPage
    if (params.isActive !== undefined) updateData.is_active = params.isActive

    // Handle price changes - need to create new Stripe price
    if (params.price !== undefined && params.price !== existing.price) {
      updateData.price = params.price

      if (params.price > 0) {
        // Get Stripe Connect account
        const { data: stripeAccount, error: stripeError } = await supabase
          .from("stripe_connect_accounts")
          .select("stripe_account_id")
          .eq("organization_id", orgId)
          .single()

        if (!stripeError && stripeAccount) {
          const stripe = getStripe()

          // Create product if doesn't exist
          let productId = existing.stripe_product_id
          if (!productId) {
            const { data: org } = await supabase
              .from("organizations")
              .select("name")
              .eq("id", orgId)
              .single()

            const product = await stripe.products.create(
              {
                name: params.name || existing.name,
                description: params.description || existing.description || `${org?.name} membership`,
              },
              { stripeAccount: stripeAccount.stripe_account_id }
            )
            productId = product.id
            updateData.stripe_product_id = productId
          }

          // Create new price (prices are immutable in Stripe)
          const billingPeriod = params.billingPeriod || existing.billing_period
          const priceParams: Stripe.PriceCreateParams = {
            product: productId,
            unit_amount: params.price,
            currency: "gbp",
          }

          if (billingPeriod !== "one_time") {
            priceParams.recurring = {
              interval: billingPeriod === "monthly" ? "month" : "year",
            }
          }

          const price = await stripe.prices.create(priceParams, {
            stripeAccount: stripeAccount.stripe_account_id,
          })
          updateData.stripe_price_id = price.id
        }
      } else {
        // Free membership - clear Stripe IDs
        updateData.stripe_product_id = null
        updateData.stripe_price_id = null
      }
    }

    const { error } = await supabase
      .from("memberships")
      .update(updateData)
      .eq("id", params.id)

    if (error) {
      console.error("Error updating membership:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateMembership:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Delete a membership
 */
export async function deleteMembership(
  membershipId: string
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Check if any active users have this membership
    const { data: activeUsers, error: usersError } = await supabase
      .from("user_memberships")
      .select("id")
      .eq("membership_id", membershipId)
      .in("status", ["active", "cancelled"])
      .limit(1)

    if (usersError) {
      console.error("Error checking users:", usersError)
      return { success: false, error: usersError.message }
    }

    if (activeUsers && activeUsers.length > 0) {
      return {
        success: false,
        error: "Cannot delete membership with active subscribers. Deactivate it instead.",
      }
    }

    const { error } = await supabase
      .from("memberships")
      .delete()
      .eq("id", membershipId)
      .eq("organization_id", orgId)

    if (error) {
      console.error("Error deleting membership:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in deleteMembership:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Reorder memberships
 */
export async function reorderMemberships(
  membershipIds: string[]
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Update sort_order for each membership
    for (let i = 0; i < membershipIds.length; i++) {
      const { error } = await supabase
        .from("memberships")
        .update({ sort_order: i })
        .eq("id", membershipIds[i])
        .eq("organization_id", orgId)

      if (error) {
        console.error("Error reordering membership:", error)
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in reorderMemberships:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// SESSION MEMBERSHIP PRICES
// ============================================

/**
 * Get membership price overrides for a session
 */
export async function getSessionMembershipPrices(
  sessionTemplateId: string
): Promise<ActionResult<{ membershipId: string; overridePrice: number | null; isEnabled: boolean }[]>> {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("session_membership_prices")
      .select("membership_id, override_price, is_enabled")
      .eq("session_template_id", sessionTemplateId)

    if (error) {
      console.error("Error fetching session membership prices:", error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: data.map((d) => ({
        membershipId: d.membership_id,
        overridePrice: d.override_price,
        isEnabled: d.is_enabled ?? true,
      })),
    }
  } catch (error) {
    console.error("Error in getSessionMembershipPrices:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Update membership price overrides for a session
 */
export async function updateSessionMembershipPrices(
  sessionTemplateId: string,
  prices: SessionMembershipPriceInput[]
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    // Delete existing prices
    await supabase
      .from("session_membership_prices")
      .delete()
      .eq("session_template_id", sessionTemplateId)

    // Insert new prices (only if there are any)
    if (prices.length > 0) {
      const { error } = await supabase.from("session_membership_prices").insert(
        prices.map((p) => ({
          session_template_id: sessionTemplateId,
          membership_id: p.membershipId,
          is_enabled: p.isEnabled,
          override_price: p.overridePrice ?? null,
        }))
      )

      if (error) {
        console.error("Error inserting session membership prices:", error)
        return { success: false, error: error.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateSessionMembershipPrices:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// PUBLIC/BOOKING ACTIONS
// ============================================

/**
 * Get visible memberships for the public booking page
 * Returns memberships that are active and visible to non-members,
 * plus any membership the current user has (even if hidden)
 */
export async function getVisibleMemberships(
  organizationId: string
): Promise<ActionResult<MembershipWithUserStatus[]>> {
  try {
    const supabase = createSupabaseServerClient()

    // Get current user's membership if logged in
    let userMembershipId: string | null = null
    const { userId: clerkUserId } = await auth()

    if (clerkUserId) {
      const { data: user } = await supabase
        .from("clerk_users")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .single()

      if (user) {
        const { data: userMembership } = await supabase
          .from("user_memberships")
          .select("membership_id, status, current_period_end")
          .eq("user_id", user.id)
          .eq("organization_id", organizationId)
          .in("status", ["active", "cancelled"])
          .maybeSingle()

        if (userMembership) {
          // Check if still in grace period for cancelled memberships
          const isActive =
            userMembership.status === "active" ||
            (userMembership.status === "cancelled" &&
              userMembership.current_period_end &&
              new Date(userMembership.current_period_end) > new Date())

          if (isActive) {
            userMembershipId = userMembership.membership_id
          }
        }
      }
    }

    // Get all active memberships
    const { data: membershipsData, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    if (error) {
      console.error("Error fetching memberships:", error)
      return { success: false, error: error.message }
    }

    // Map snake_case DB columns to camelCase
    const memberships = (membershipsData || []).map(mapDbMembershipToMembership)

    // All active memberships are visible; per-session isEnabled controls availability at checkout
    const visibleMemberships = memberships.map((m) => ({
      ...m,
      isUserMembership: m.id === userMembershipId,
    }))

    return { success: true, data: visibleMemberships }
  } catch (error) {
    console.error("Error in getVisibleMemberships:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get memberships for the public /members listing page.
 * Returns only active memberships with showOnMembershipPage = true.
 * Also checks if the current user has an active membership.
 */
export async function getPublicMembershipsForListing(
  organizationId: string
): Promise<ActionResult<{ memberships: Membership[]; userHasActiveMembership: boolean }>> {
  try {
    const supabase = createSupabaseServerClient()

    // Check if current user has an active membership
    let userHasActiveMembership = false
    const { userId: clerkUserId } = await auth()

    if (clerkUserId) {
      const { data: user } = await supabase
        .from("clerk_users")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .single()

      if (user) {
        const { data: userMembership } = await supabase
          .from("user_memberships")
          .select("membership_id, status, current_period_end")
          .eq("user_id", user.id)
          .eq("organization_id", organizationId)
          .in("status", ["active", "cancelled"])
          .maybeSingle()

        if (userMembership) {
          const isActive =
            userMembership.status === "active" ||
            (userMembership.status === "cancelled" &&
              userMembership.current_period_end &&
              new Date(userMembership.current_period_end) > new Date())
          userHasActiveMembership = isActive
        }
      }
    }

    // Get active memberships visible on the members page
    const { data: membershipsData, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("show_on_membership_page", true)
      .order("sort_order", { ascending: true })

    if (error) {
      console.error("Error fetching public memberships:", error)
      return { success: false, error: error.message }
    }

    const memberships = (membershipsData || []).map(mapDbMembershipToMembership)

    return { success: true, data: { memberships, userHasActiveMembership } }
  } catch (error) {
    console.error("Error in getPublicMembershipsForListing:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export interface MembershipWithOrganization extends Membership {
  organization: {
    id: string
    name: string
    slug: string
  }
}

/**
 * Get a single membership by ID for the public membership landing page.
 * Only returns if the membership is active and has showOnMembershipPage enabled.
 */
export async function getMembershipByIdPublic(
  membershipId: string,
  organizationId: string
): Promise<ActionResult<MembershipWithOrganization>> {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from("memberships")
      .select("*, organizations(id, name, slug)")
      .eq("id", membershipId)
      .eq("organization_id", organizationId)
      .single()

    if (error) {
      console.error("Error fetching membership:", error)
      return { success: false, error: "Membership not found" }
    }

    if (!data) {
      return { success: false, error: "Membership not found" }
    }

    // Check if membership is publicly accessible via the landing page
    if (!data.is_active) {
      return { success: false, error: "This membership is no longer available" }
    }

    const membership = mapDbMembershipToMembership(data)

    return {
      success: true,
      data: {
        ...membership,
        organization: {
          id: data.organizations.id,
          name: data.organizations.name,
          slug: data.organizations.slug,
        },
      },
    }
  } catch (error) {
    console.error("Error in getMembershipByIdPublic:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Subscribe to a free membership (price = 0)
 * Directly creates user_membership record without Stripe
 */
export async function subscribeToFreeMembership(
  membershipId: string
): Promise<ActionResult<{ membershipId: string }>> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    // Get membership and verify it's free
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("*")
      .eq("id", membershipId)
      .single()

    if (membershipError || !membership) {
      return { success: false, error: "Membership not found" }
    }

    if (membership.price > 0) {
      return { success: false, error: "This membership requires payment" }
    }

    if (!membership.is_active) {
      return { success: false, error: "This membership is no longer available" }
    }

    // Check for existing membership in this org
    const { data: existingMembership } = await supabase
      .from("user_memberships")
      .select("id, status, stripe_subscription_id")
      .eq("user_id", authResult.internalUserId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle()

    if (existingMembership) {
      // Cancel any active Stripe subscription before switching to a free membership
      if (existingMembership.stripe_subscription_id) {
        const { data: stripeAccount } = await supabase
          .from("stripe_connect_accounts")
          .select("stripe_account_id")
          .eq("organization_id", membership.organization_id)
          .single()

        if (stripeAccount?.stripe_account_id) {
          try {
            const stripe = getStripe()
            await stripe.subscriptions.cancel(existingMembership.stripe_subscription_id, {
              stripeAccount: stripeAccount.stripe_account_id,
            })
            console.log(`Cancelled Stripe subscription ${existingMembership.stripe_subscription_id} before switching to free membership`)
          } catch (stripeError) {
            console.error("Error cancelling Stripe subscription:", stripeError)
            return { success: false, error: "Failed to cancel existing subscription. Please try again." }
          }
        } else {
          console.error("Could not find Stripe Connect account to cancel subscription", existingMembership.stripe_subscription_id)
          return { success: false, error: "Failed to cancel existing subscription: Stripe account not found." }
        }
      }

      // Update existing record
      const { error: updateError } = await supabase
        .from("user_memberships")
        .update({
          membership_id: membershipId,
          status: "active",
          stripe_subscription_id: null, // Free memberships have no Stripe subscription
          current_period_start: new Date().toISOString(),
          current_period_end: null, // Free memberships don't expire
          cancelled_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMembership.id)

      if (updateError) {
        console.error("Error updating membership:", updateError)
        return { success: false, error: updateError.message }
      }
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from("user_memberships")
        .insert({
          user_id: authResult.internalUserId,
          organization_id: membership.organization_id,
          membership_id: membershipId,
          status: "active",
          current_period_start: new Date().toISOString(),
        })

      if (insertError) {
        console.error("Error creating membership:", insertError)
        return { success: false, error: insertError.message }
      }
    }

    return { success: true, data: { membershipId } }
  } catch (error) {
    console.error("Error in subscribeToFreeMembership:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get user's current membership for an organization (with full membership details)
 */
export async function getUserMembershipWithDetails(
  organizationId: string
): Promise<ActionResult<{ membership: Membership; userMembership: UserMembership } | null>> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    const { data: userMembership, error } = await supabase
      .from("user_memberships")
      .select("*, memberships(*)")
      .eq("user_id", authResult.internalUserId)
      .eq("organization_id", organizationId)
      .in("status", ["active", "cancelled"])
      .maybeSingle()

    if (error) {
      console.error("Error fetching user membership:", error)
      return { success: false, error: error.message }
    }

    if (!userMembership || !userMembership.memberships) {
      return { success: true, data: null }
    }

    // Check if still active (including grace period)
    const isActive = isMembershipActive(userMembership as UserMembership)
    if (!isActive) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        membership: userMembership.memberships as Membership,
        userMembership: userMembership as UserMembership,
      },
    }
  } catch (error) {
    console.error("Error in getUserMembershipWithDetails:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// BOOKING PAGE PRICING DATA
// ============================================

export interface MembershipPricingOption {
  membership: Membership
  sessionPrice: number // Calculated price for this session
  isUserMembership: boolean
}

export interface BookingMembershipPricingData {
  memberships: MembershipPricingOption[]
  userMembershipId: string | null
  // User's membership is active but not enabled for this specific session
  userMembershipDisabled: boolean
  userMembershipName: string | null
  // Backward compatibility
  memberPrice: number
  monthlyMembershipPrice: number | null
  isActiveMember: boolean
}

/**
 * Get membership pricing data for the booking page.
 * Returns all visible memberships with calculated session prices.
 */
export async function getBookingMembershipPricingData(params: {
  organizationId: string
  dropInPrice: number
  sessionTemplateId: string
}): Promise<ActionResult<BookingMembershipPricingData>> {
  try {
    const supabase = createSupabaseServerClient()

    // Get visible memberships
    const membershipsResult = await getVisibleMemberships(params.organizationId)
    if (!membershipsResult.success || !membershipsResult.data) {
      return { success: false, error: membershipsResult.error || "Failed to fetch memberships" }
    }

    const memberships = membershipsResult.data

    // Get session membership price overrides and availability
    const pricesResult = await getSessionMembershipPrices(params.sessionTemplateId)
    const overrides: Record<string, number | null> = {}
    const hasPerSessionSettings = !!(pricesResult.success && pricesResult.data && pricesResult.data.length > 0)
    const enabledMembershipIds = new Set<string>()

    if (pricesResult.success && pricesResult.data) {
      pricesResult.data.forEach((p) => {
        if (p.overridePrice != null) overrides[p.membershipId] = p.overridePrice
        if (p.isEnabled) enabledMembershipIds.add(p.membershipId)
      })
    }

    // Identify user's own membership before filtering
    const userOwnMembership = memberships.find(m => m.isUserMembership)

    // Detect if user's membership is specifically blocked by per-session config
    const userMembershipDisabled = hasPerSessionSettings &&
      !!userOwnMembership &&
      !enabledMembershipIds.has(userOwnMembership.id)

    // Filter memberships by per-session availability
    // If no per-session rows exist (legacy session), show all memberships
    // Do NOT include the user's membership if it's been explicitly disabled for this session
    const filteredMemberships = hasPerSessionSettings
      ? memberships.filter((m) => enabledMembershipIds.has(m.id))
      : memberships

    // Calculate session price for each membership
    const { calculateMembershipSessionPrice } = await import("@/lib/pricing-utils")
    const pricingOptions: MembershipPricingOption[] = filteredMemberships.map((m) => ({
      membership: m,
      sessionPrice: calculateMembershipSessionPrice({
        dropInPrice: params.dropInPrice,
        membership: m,
        sessionOverridePrice: overrides[m.id] ?? null,
      }),
      isUserMembership: m.isUserMembership || false,
    }))

    // Find user's membership
    const userMembership = pricingOptions.find((m) => m.isUserMembership)
    const userMembershipId = userMembership?.membership.id || null

    // Calculate backward-compatible values
    const bestMemberPrice = pricingOptions.length > 0
      ? Math.min(...pricingOptions.map((m) => m.sessionPrice))
      : params.dropInPrice

    // Get first membership's monthly price for backward compat
    const firstMembership = pricingOptions[0]
    const monthlyMembershipPrice = firstMembership
      ? firstMembership.membership.price
      : null

    return {
      success: true,
      data: {
        memberships: pricingOptions,
        userMembershipId,
        userMembershipDisabled,
        userMembershipName: userMembershipDisabled ? (userOwnMembership?.name ?? null) : null,
        // Backward compatibility
        memberPrice: userMembership?.sessionPrice ?? bestMemberPrice,
        monthlyMembershipPrice,
        isActiveMember: !!userMembership,
      },
    }
  } catch (error) {
    console.error("Error in getBookingMembershipPricingData:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
