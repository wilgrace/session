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
}

interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthenticatedOrg(): Promise<{ orgId: string } | { error: string }> {
  const { userId } = await auth()

  if (!userId) {
    return { error: "Unauthorized: Not logged in" }
  }

  // Get the user's organization from Supabase clerk_users table
  const supabase = createSupabaseServerClient()
  const { data: user, error } = await supabase
    .from("clerk_users")
    .select("organization_id, is_super_admin")
    .eq("clerk_user_id", userId)
    .single()

  if (error || !user) {
    return { error: "User not found" }
  }

  if (!user.is_super_admin) {
    return { error: "Unauthorized: Admin access required" }
  }

  if (!user.organization_id) {
    return { error: "No organization associated with user" }
  }

  return { orgId: user.organization_id }
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

    return {
      success: true,
      data: {
        connected: true,
        onboardingComplete: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        stripeAccountId: account.stripe_account_id,
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
