"use server"

import { auth } from "@clerk/nextjs/server"
import { createSupabaseServerClient } from "@/lib/supabase"
import Stripe from "stripe"

// Lazy initialization to avoid build-time errors when env vars aren't available
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
  })
}

// ============================================
// TYPES
// ============================================

export interface StripeConnectStatus {
  connected: boolean
  onboardingComplete: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  stripeAccountId: string | null
  // Enhanced account details (populated when connected)
  businessName?: string
  balance?: {
    available: number  // in pence
    pending: number    // in pence
    currency: string   // e.g., "gbp"
  }
}

export interface PromotionCodeInfo {
  id: string
  code: string
  percentOff?: number
  amountOff?: number
  currency?: string
  duration: "forever" | "once" | "repeating"
  durationInMonths?: number
  active: boolean
  timesRedeemed: number
  maxRedemptions?: number
}

interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthenticatedOrg(organizationId?: string): Promise<{ orgId: string } | { error: string }> {
  const { userId } = await auth()

  if (!userId) {
    return { error: "Unauthorized: Not logged in" }
  }

  const supabase = createSupabaseServerClient()

  // Get the user's internal ID
  const { data: user, error: userError } = await supabase
    .from("clerk_users")
    .select("id, organization_id, role")
    .eq("clerk_user_id", userId)
    .single()

  if (userError || !user) {
    return { error: "User not found" }
  }

  // Determine which organization to use:
  // 1. Explicit parameter
  // 2. Request headers (set by middleware for /[slug]/ routes)
  // 3. User's primary organization
  let orgId = organizationId;

  if (!orgId) {
    const { getTenantFromHeaders } = await import('@/lib/tenant-utils');
    const tenant = await getTenantFromHeaders();
    orgId = tenant?.organizationId;
  }

  if (!orgId) {
    orgId = user.organization_id;
  }

  if (!orgId) {
    return { error: "No organization specified" }
  }

  // Check if user has admin access to this organization
  // Superadmins can access any org, admins can only access their own org
  const hasAccess =
    user.role === 'superadmin' ||
    (user.role === 'admin' && user.organization_id === orgId);

  if (!hasAccess) {
    return { error: "Unauthorized: Admin access required" }
  }

  return { orgId }
}

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Get the Stripe Connect status for the current user's organization
 */
export async function getStripeConnectStatus(): Promise<ActionResult<StripeConnectStatus>> {
  try {
    const authResult = await getAuthenticatedOrg()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    const { data: account, error } = await supabase
      .from("stripe_connect_accounts")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle()

    if (error) {
      console.error("Error fetching Stripe account:", error)
      return { success: false, error: error.message }
    }

    if (!account) {
      return {
        success: true,
        data: {
          connected: false,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          stripeAccountId: null,
        }
      }
    }

    // Fetch additional account details from Stripe when connected
    let businessName: string | undefined
    let balance: StripeConnectStatus["balance"] | undefined

    if (account.charges_enabled) {
      try {
        const stripe = getStripe()

        // Fetch account details for business name
        const stripeAccount = await stripe.accounts.retrieve(account.stripe_account_id)
        businessName = stripeAccount.business_profile?.name || stripeAccount.settings?.dashboard?.display_name || undefined

        // Fetch balance
        const balanceData = await stripe.balance.retrieve({
          stripeAccount: account.stripe_account_id,
        })

        // Sum up available and pending balances (in case of multiple currencies, use the first/primary)
        const availableBalance = balanceData.available[0]
        const pendingBalance = balanceData.pending[0]

        if (availableBalance) {
          balance = {
            available: availableBalance.amount,
            pending: pendingBalance?.amount || 0,
            currency: availableBalance.currency,
          }
        }
      } catch (stripeError) {
        // Log but don't fail - these are optional enhancements
        console.error("Error fetching Stripe account details:", stripeError)
      }
    }

    return {
      success: true,
      data: {
        connected: true,
        onboardingComplete: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        stripeAccountId: account.stripe_account_id,
        businessName,
        balance,
      }
    }
  } catch (error) {
    console.error("Error in getStripeConnectStatus:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Create a Stripe Connect Express account for the organization
 */
export async function createStripeConnectAccount(): Promise<ActionResult<{ accountId: string }>> {
  try {
    const authResult = await getAuthenticatedOrg()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Check if account already exists
    const { data: existing } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("organization_id", orgId)
      .maybeSingle()

    if (existing) {
      return { success: true, data: { accountId: existing.stripe_account_id } }
    }

    // Get organization details for the account
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single()

    // Create Stripe Standard account
    const stripe = getStripe()
    const account = await stripe.accounts.create({
      type: "standard",
      country: "GB",
      business_profile: {
        name: org?.name || undefined,
        product_description: "Session booking services",
      },
    })

    // Store in database
    const { error: insertError } = await supabase
      .from("stripe_connect_accounts")
      .insert({
        organization_id: orgId,
        stripe_account_id: account.id,
        account_type: "standard",
        country: account.country,
        default_currency: account.default_currency,
      })

    if (insertError) {
      console.error("Error inserting Stripe account:", insertError)
      // Clean up Stripe account if DB insert fails
      try {
        await stripe.accounts.del(account.id)
      } catch (deleteError) {
        console.error("Error cleaning up Stripe account:", deleteError)
      }
      return { success: false, error: insertError.message }
    }

    return { success: true, data: { accountId: account.id } }
  } catch (error) {
    console.error("Error in createStripeConnectAccount:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Create an Account Link for Stripe onboarding
 */
export async function createOnboardingLink(): Promise<ActionResult<{ url: string }>> {
  try {
    const authResult = await getAuthenticatedOrg()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get the Stripe account ID
    const { data: account } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("organization_id", orgId)
      .single()

    if (!account) {
      return { success: false, error: "No Stripe account found. Create one first." }
    }

    // Determine base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Create Account Link
    const stripe = getStripe()
    const accountLink = await stripe.accountLinks.create({
      account: account.stripe_account_id,
      refresh_url: `${baseUrl}/admin/billing?refresh=true`,
      return_url: `${baseUrl}/admin/billing?success=true`,
      type: "account_onboarding",
    })

    return { success: true, data: { url: accountLink.url } }
  } catch (error) {
    console.error("Error in createOnboardingLink:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Get the dashboard URL for the connected Stripe account
 * Standard accounts use dashboard.stripe.com, Express accounts use login links
 */
export async function createDashboardLink(): Promise<ActionResult<{ url: string }>> {
  try {
    const authResult = await getAuthenticatedOrg()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    const { data: account } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, account_type")
      .eq("organization_id", orgId)
      .single()

    if (!account) {
      return { success: false, error: "No Stripe account found" }
    }

    // Standard accounts use the regular Stripe Dashboard
    if (account.account_type === "standard") {
      return { success: true, data: { url: "https://dashboard.stripe.com" } }
    }

    // Express accounts use login links
    const stripe = getStripe()
    const loginLink = await stripe.accounts.createLoginLink(
      account.stripe_account_id
    )

    return { success: true, data: { url: loginLink.url } }
  } catch (error) {
    console.error("Error in createDashboardLink:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Disconnect Stripe account from organization
 * This removes the connection from our database but does NOT delete the Stripe account itself
 */
export async function disconnectStripeAccount(): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedOrg()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Delete the connection from our database
    const { error } = await supabase
      .from("stripe_connect_accounts")
      .delete()
      .eq("organization_id", orgId)

    if (error) {
      console.error("Error disconnecting Stripe account:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in disconnectStripeAccount:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Get all active promotion codes from the Connected Stripe account
 */
export async function getPromotionCodes(): Promise<ActionResult<PromotionCodeInfo[]>> {
  try {
    const authResult = await getAuthenticatedOrg()
    if ("error" in authResult) {
      return { success: false, error: authResult.error }
    }

    const { orgId } = authResult
    const supabase = createSupabaseServerClient()

    // Get the Stripe account ID
    const { data: account } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("organization_id", orgId)
      .single()

    if (!account) {
      return { success: false, error: "No Stripe account found" }
    }

    if (!account.charges_enabled) {
      return { success: true, data: [] }
    }

    const stripe = getStripe()

    // Fetch all active promotion codes
    const promotionCodes = await stripe.promotionCodes.list(
      { active: true, limit: 100 },
      { stripeAccount: account.stripe_account_id }
    )

    // Fetch coupon details for each promotion code
    // The coupon ID is nested under promotion.coupon in newer API versions
    const codes: PromotionCodeInfo[] = await Promise.all(
      promotionCodes.data.map(async (promoCode) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const promoCodeAny = promoCode as any
        const couponId = promoCodeAny.promotion?.coupon as string | undefined

        let coupon: Stripe.Coupon | null = null
        if (couponId) {
          try {
            coupon = await stripe.coupons.retrieve(
              couponId,
              { stripeAccount: account.stripe_account_id }
            )
          } catch (e) {
            console.error("Failed to fetch coupon", couponId, e)
          }
        }

        return {
          id: promoCode.id,
          code: promoCode.code,
          percentOff: coupon?.percent_off ?? undefined,
          amountOff: coupon?.amount_off ?? undefined,
          currency: coupon?.currency ?? undefined,
          duration: (coupon?.duration as "forever" | "once" | "repeating") ?? "once",
          durationInMonths: coupon?.duration_in_months ?? undefined,
          active: promoCode.active,
          timesRedeemed: promoCode.times_redeemed,
          maxRedemptions: promoCode.max_redemptions ?? undefined,
        }
      })
    )

    return { success: true, data: codes }
  } catch (error) {
    console.error("Error in getPromotionCodes:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}
