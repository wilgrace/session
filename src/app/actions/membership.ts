"use server"

import { auth } from "@clerk/nextjs/server"
import { createSupabaseServerClient } from "@/lib/supabase"
import Stripe from "stripe"
import type { UserMembership } from "@/lib/db/schema"
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

export interface MembershipStatus {
  hasMembership: boolean
  isActive: boolean
  status: "none" | "active" | "expired" | "cancelled"
  stripeSubscriptionId: string | null
  currentPeriodEnd: Date | null
  cancelledAt: Date | null
  // Membership tier details
  membershipName: string | null
  membershipDescription: string | null
  membershipPriceType: "discount" | "fixed" | null
  membershipDiscountPercent: number | null
}

export interface MembershipConfig {
  monthlyPrice: number | null // in pence
  productId: string | null
  priceId: string | null
  memberPriceType: "discount" | "fixed" | null
  memberDiscountPercent: number | null
  memberFixedPrice: number | null // in pence
}

export interface BillingHistoryItem {
  id: string
  amount: number // in pence
  status: string
  created: Date
  pdfUrl?: string
  description?: string
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Supabase returns snake_case columns; map them to the camelCase UserMembership shape
// that Drizzle's $inferSelect produces, so isMembershipActive() can safely access
// currentPeriodEnd / cancelledAt without getting undefined.
function mapUserMembership(data: Record<string, unknown>): UserMembership {
  return {
    id: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    membershipId: data.membership_id ?? null,
    status: data.status,
    stripeSubscriptionId: data.stripe_subscription_id ?? null,
    stripeCustomerId: data.stripe_customer_id ?? null,
    currentPeriodStart: data.current_period_start ? new Date(data.current_period_start as string) : null,
    currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end as string) : null,
    cancelledAt: data.cancelled_at ? new Date(data.cancelled_at as string) : null,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  } as UserMembership
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
// USER-FACING ACTIONS
// ============================================

/**
 * Get the current user's membership status for an organization
 */
export async function getUserMembership(
  organizationId: string
): Promise<ActionResult<MembershipStatus>> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    const { data: membership, error } = await supabase
      .from("user_memberships")
      .select("*")
      .eq("user_id", authResult.internalUserId)
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (error) {
      console.error("Error fetching membership:", error)
      return { success: false, error: error.message }
    }

    if (!membership) {
      return {
        success: true,
        data: {
          hasMembership: false,
          isActive: false,
          status: "none",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          cancelledAt: null,
          membershipName: null,
          membershipDescription: null,
          membershipPriceType: null,
          membershipDiscountPercent: null,
        },
      }
    }

    const isActive = isMembershipActive(mapUserMembership(membership as Record<string, unknown>))

    // Fetch membership tier details if user has a membership_id
    let membershipDetails: {
      name: string
      description: string | null
      member_price_type: string
      member_discount_percent: number | null
    } | null = null

    if (membership.membership_id) {
      const { data: tier } = await supabase
        .from("memberships")
        .select("name, description, member_price_type, member_discount_percent")
        .eq("id", membership.membership_id)
        .single()

      membershipDetails = tier
    }

    return {
      success: true,
      data: {
        hasMembership: true,
        isActive,
        status: membership.status,
        stripeSubscriptionId: membership.stripe_subscription_id,
        currentPeriodEnd: membership.current_period_end
          ? new Date(membership.current_period_end)
          : null,
        cancelledAt: membership.cancelled_at
          ? new Date(membership.cancelled_at)
          : null,
        membershipName: membershipDetails?.name ?? null,
        membershipDescription: membershipDetails?.description ?? null,
        membershipPriceType: (membershipDetails?.member_price_type as "discount" | "fixed") ?? null,
        membershipDiscountPercent: membershipDetails?.member_discount_percent ?? null,
      },
    }
  } catch (error) {
    console.error("Error in getUserMembership:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get user's billing history from the Connected Account
 */
export async function getUserBillingHistory(
  organizationId: string
): Promise<ActionResult<BillingHistoryItem[]>> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    // Get user's membership to find their Stripe customer ID
    const { data: membership, error: membershipError } = await supabase
      .from("user_memberships")
      .select("stripe_customer_id")
      .eq("user_id", authResult.internalUserId)
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (membershipError) {
      console.error("Error fetching membership:", membershipError)
      return { success: false, error: membershipError.message }
    }

    if (!membership?.stripe_customer_id) {
      return { success: true, data: [] }
    }

    // Get the organization's Stripe account
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("organization_id", organizationId)
      .single()

    if (stripeError || !stripeAccount) {
      return { success: false, error: "Stripe not configured" }
    }

    // Fetch invoices from Stripe
    const stripe = getStripe()
    const invoices = await stripe.invoices.list(
      {
        customer: membership.stripe_customer_id,
        limit: 10,
      },
      { stripeAccount: stripeAccount.stripe_account_id }
    )

    const history: BillingHistoryItem[] = invoices.data.map((invoice) => ({
      id: invoice.id,
      amount: invoice.amount_paid,
      status: invoice.status || "unknown",
      created: new Date(invoice.created * 1000),
      pdfUrl: invoice.invoice_pdf || undefined,
      description: invoice.description || undefined,
    }))

    return { success: true, data: history }
  } catch (error) {
    console.error("Error in getUserBillingHistory:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Create a Stripe billing portal session for the user to manage their subscription
 */
export async function createBillingPortalSession(
  organizationId: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const authResult = await getAuthenticatedUser()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const supabase = createSupabaseServerClient()

    // Get user's membership
    const { data: membership, error: membershipError } = await supabase
      .from("user_memberships")
      .select("stripe_customer_id")
      .eq("user_id", authResult.internalUserId)
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (membershipError || !membership?.stripe_customer_id) {
      return { success: false, error: "No membership found" }
    }

    // Get the organization's Stripe account
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("organization_id", organizationId)
      .single()

    if (stripeError || !stripeAccount) {
      return { success: false, error: "Stripe not configured" }
    }

    // Get the organization slug for the return URL
    const { data: org } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", organizationId)
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const returnUrl = org?.slug
      ? `${baseUrl}/${org.slug}/account`
      : `${baseUrl}/account`

    // Create billing portal session
    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: membership.stripe_customer_id,
        return_url: returnUrl,
      },
      { stripeAccount: stripeAccount.stripe_account_id }
    )

    return { success: true, data: { url: session.url } }
  } catch (error) {
    console.error("Error in createBillingPortalSession:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// ADMIN ACTIONS
// ============================================

/**
 * Get the membership configuration for an organization
 */
export async function getMembershipConfig(): Promise<ActionResult<MembershipConfig>> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get org settings
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("member_price_type, member_discount_percent, member_fixed_price")
      .eq("id", orgId)
      .single()

    if (orgError) {
      console.error("Error fetching org:", orgError)
      return { success: false, error: orgError.message }
    }

    // Get Stripe account with membership IDs
    const { data: stripeAccount } = await supabase
      .from("stripe_connect_accounts")
      .select(
        "membership_product_id, membership_price_id, membership_monthly_price"
      )
      .eq("organization_id", orgId)
      .maybeSingle()

    return {
      success: true,
      data: {
        monthlyPrice: stripeAccount?.membership_monthly_price || null,
        productId: stripeAccount?.membership_product_id || null,
        priceId: stripeAccount?.membership_price_id || null,
        memberPriceType: org.member_price_type as "discount" | "fixed" | null,
        memberDiscountPercent: org.member_discount_percent,
        memberFixedPrice: org.member_fixed_price,
      },
    }
  } catch (error) {
    console.error("Error in getMembershipConfig:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Configure membership pricing - creates Product and Price on Connected Account
 */
export async function configureMembershipPricing(params: {
  monthlyPrice: number // in pounds (e.g., 15 for £15)
}): Promise<ActionResult<{ priceId: string }>> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get organization name
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single()

    if (orgError || !org) {
      return { success: false, error: "Organization not found" }
    }

    // Get Stripe Connect account
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, membership_product_id")
      .eq("organization_id", orgId)
      .single()

    if (stripeError || !stripeAccount) {
      return {
        success: false,
        error: "Stripe not connected. Please connect Stripe first.",
      }
    }

    const stripe = getStripe()
    const priceInPence = Math.round(params.monthlyPrice * 100)

    let productId = stripeAccount.membership_product_id

    // Create product on the CONNECTED ACCOUNT
    // This keeps the subscription relationship with the business, not the platform
    if (!productId) {
      const product = await stripe.products.create(
        {
          name: "Monthly Membership",
          description: `${org.name} monthly membership - member pricing on all sessions`,
        },
        { stripeAccount: stripeAccount.stripe_account_id }
      )
      productId = product.id
    }

    // Create price on the CONNECTED ACCOUNT
    // Stripe prices are immutable, so we always create a new one
    const price = await stripe.prices.create(
      {
        product: productId,
        unit_amount: priceInPence,
        currency: "gbp",
        recurring: { interval: "month" },
      },
      { stripeAccount: stripeAccount.stripe_account_id }
    )

    // Update our database with the new price
    const { error: updateError } = await supabase
      .from("stripe_connect_accounts")
      .update({
        membership_product_id: productId,
        membership_price_id: price.id,
        membership_monthly_price: priceInPence,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId)

    if (updateError) {
      console.error("Error updating stripe account:", updateError)
      return { success: false, error: updateError.message }
    }

    return { success: true, data: { priceId: price.id } }
  } catch (error) {
    console.error("Error in configureMembershipPricing:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Update organization-level member pricing defaults
 */
export async function updateMemberPricingDefaults(params: {
  memberPriceType: "discount" | "fixed"
  memberDiscountPercent?: number // e.g., 20 for 20% off
  memberFixedPrice?: number // in pence
}): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedAdmin()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    const updateData: Record<string, unknown> = {
      member_price_type: params.memberPriceType,
      updated_at: new Date().toISOString(),
    }

    if (params.memberPriceType === "discount") {
      updateData.member_discount_percent = params.memberDiscountPercent ?? null
      updateData.member_fixed_price = null
    } else {
      updateData.member_fixed_price = params.memberFixedPrice ?? null
      updateData.member_discount_percent = null
    }

    const { error } = await supabase
      .from("organizations")
      .update(updateData)
      .eq("id", orgId)

    if (error) {
      console.error("Error updating org:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateMemberPricingDefaults:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// PUBLIC HELPERS (for checkout/booking flows)
// ============================================

/**
 * Get membership status for a user (used by checkout flow)
 * This is a public function that doesn't require the user to be the one checking
 */
export async function getMembershipForUser(
  internalUserId: string,
  organizationId: string
): Promise<UserMembership | null> {
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from("user_memberships")
    .select("*")
    .eq("user_id", internalUserId)
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return mapUserMembership(data as Record<string, unknown>)
}

/**
 * Get the Stripe Connect account details needed for checkout
 */
export async function getStripeAccountForOrg(
  organizationId: string
): Promise<{
  stripeAccountId: string
  membershipPriceId: string | null
  membershipMonthlyPrice: number | null
  chargesEnabled: boolean
} | null> {
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from("stripe_connect_accounts")
    .select(
      "stripe_account_id, membership_price_id, membership_monthly_price, charges_enabled"
    )
    .eq("organization_id", organizationId)
    .single()

  if (error || !data) {
    return null
  }

  return {
    stripeAccountId: data.stripe_account_id,
    membershipPriceId: data.membership_price_id,
    membershipMonthlyPrice: data.membership_monthly_price,
    chargesEnabled: data.charges_enabled,
  }
}

/**
 * Get pricing data for the booking form.
 * This is a public function that returns the data needed to display pricing options.
 */
export interface BookingPricingData {
  memberPrice: number
  monthlyMembershipPrice: number | null
  isActiveMember: boolean
}

export async function getBookingPricingData(params: {
  organizationId: string
  dropInPrice: number
  templateMemberPrice?: number | null
}): Promise<ActionResult<BookingPricingData>> {
  try {
    const supabase = createSupabaseServerClient()

    // Get org pricing settings
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("member_price_type, member_discount_percent, member_fixed_price")
      .eq("id", params.organizationId)
      .single()

    if (orgError) {
      console.error("Error fetching org:", orgError)
      return { success: false, error: orgError.message }
    }

    // Get Stripe account for monthly membership price
    const { data: stripeAccount } = await supabase
      .from("stripe_connect_accounts")
      .select("membership_monthly_price")
      .eq("organization_id", params.organizationId)
      .maybeSingle()

    // Calculate member price
    const { calculateMemberPrice } = await import("@/lib/pricing-utils")
    const memberPrice = calculateMemberPrice({
      dropInPrice: params.dropInPrice,
      templateMemberPrice: params.templateMemberPrice ?? null,
      orgMemberPriceType: org?.member_price_type as "discount" | "fixed" | null,
      orgMemberDiscountPercent: org?.member_discount_percent ?? null,
      orgMemberFixedPrice: org?.member_fixed_price ?? null,
    })

    // Check if current user has active membership
    let isActiveMember = false
    const { userId: clerkUserId } = await auth()

    if (clerkUserId) {
      const { data: user } = await supabase
        .from("clerk_users")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .single()

      if (user) {
        const membership = await getMembershipForUser(user.id, params.organizationId)
        isActiveMember = isMembershipActive(membership)
      }
    }

    return {
      success: true,
      data: {
        memberPrice,
        monthlyMembershipPrice: stripeAccount?.membership_monthly_price || null,
        isActiveMember,
      },
    }
  } catch (error) {
    console.error("Error in getBookingPricingData:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
