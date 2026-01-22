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

export interface CreateCheckoutSessionParams {
  sessionTemplateId: string
  startTime: string
  numberOfSpots: number
  guestEmail?: string
  guestName?: string
}

export interface CreateCheckoutSessionResult {
  success: boolean
  clientSecret?: string
  bookingId?: string
  error?: string
}

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Create a Stripe Checkout session for a paid booking
 * Creates a pending booking and redirects to Stripe Checkout
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CreateCheckoutSessionResult> {
  try {
    const { userId } = await auth()
    console.log("createCheckoutSession - Clerk userId:", userId)
    const supabase = createSupabaseServerClient()

    // Get session template with pricing info
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("*, organization_id")
      .eq("id", params.sessionTemplateId)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Session not found" }
    }

    if (template.pricing_type !== "paid" || !template.drop_in_price) {
      return { success: false, error: "This session does not require payment" }
    }

    // Get the organization's Stripe account
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("organization_id", template.organization_id)
      .single()

    if (stripeError || !stripeAccount) {
      return { success: false, error: "Payment not configured for this organization" }
    }

    if (!stripeAccount.charges_enabled) {
      return { success: false, error: "Payment processing is not yet enabled for this organization" }
    }

    // Get or create user record
    let internalUserId: string
    let customerEmail: string | undefined = params.guestEmail

    if (userId) {
      // Logged in user - get their internal ID and email
      const { data: userData, error: userError } = await supabase
        .from("clerk_users")
        .select("id, email")
        .eq("clerk_user_id", userId)
        .single()

      if (userError) {
        console.error("Error fetching user:", userError)
        return { success: false, error: `User lookup failed: ${userError.message}` }
      }
      if (!userData) {
        return { success: false, error: "User not found in database. Please try signing out and back in." }
      }
      internalUserId = userData.id
      customerEmail = userData.email || undefined
    } else {
      // Guest user - find existing or create a temporary user record
      if (!params.guestEmail || !params.guestName) {
        return { success: false, error: "Email and name required for guest checkout" }
      }

      // First check if a user with this email already exists
      const { data: existingUser, error: existingError } = await supabase
        .from("clerk_users")
        .select("id, clerk_user_id")
        .eq("email", params.guestEmail)
        .maybeSingle()

      if (existingError) {
        console.error("Error checking existing user:", existingError)
        return { success: false, error: `Failed to check existing user: ${existingError.message}` }
      }

      if (existingUser) {
        // If it's a registered user (not a guest), prompt them to sign in
        if (!existingUser.clerk_user_id.startsWith("guest_")) {
          return {
            success: false,
            error: "An account with this email already exists. Please sign in to continue."
          }
        }
        // Reuse existing guest user
        internalUserId = existingUser.id
      } else {
        // Create new guest user
        const nameParts = params.guestName.trim().split(" ")
        const firstName = nameParts[0] || ""
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined

        const { data: guestUser, error: guestError } = await supabase
          .from("clerk_users")
          .insert({
            clerk_user_id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
            email: params.guestEmail,
            first_name: firstName,
            last_name: lastName,
            organization_id: template.organization_id,
          })
          .select("id")
          .single()

        if (guestError) {
          console.error("Error creating guest user:", guestError)
          return { success: false, error: `Failed to create guest user: ${guestError.message}` }
        }
        if (!guestUser) {
          return { success: false, error: "Failed to create guest user: No data returned" }
        }
        internalUserId = guestUser.id
      }
    }

    // Calculate end time
    const startTime = new Date(params.startTime)
    const endTime = new Date(startTime.getTime() + template.duration_minutes * 60 * 1000)

    // Find or create session instance
    let { data: instance, error: instanceError } = await supabase
      .from("session_instances")
      .select("id")
      .eq("template_id", params.sessionTemplateId)
      .eq("start_time", startTime.toISOString())
      .eq("end_time", endTime.toISOString())
      .eq("status", "scheduled")
      .maybeSingle()

    if (!instance) {
      // Create the instance
      const { data: newInstance, error: createError } = await supabase
        .from("session_instances")
        .insert({
          template_id: params.sessionTemplateId,
          organization_id: template.organization_id,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: "scheduled",
        })
        .select("id")
        .single()

      if (createError || !newInstance) {
        return { success: false, error: "Failed to create session instance" }
      }
      instance = newInstance
    }

    // Calculate total amount
    const totalAmount = template.drop_in_price * params.numberOfSpots

    // Create pending booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        session_instance_id: instance.id,
        user_id: internalUserId,
        organization_id: template.organization_id,
        number_of_spots: params.numberOfSpots,
        status: "pending_payment",
        payment_status: "pending",
        amount_paid: totalAmount,
      })
      .select("id")
      .single()

    if (bookingError) {
      console.error("Error creating booking:", bookingError)
      return { success: false, error: `Failed to create booking: ${bookingError.message}` }
    }
    if (!booking) {
      return { success: false, error: "Failed to create booking: No data returned" }
    }

    // Determine base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Create Stripe Checkout session (embedded mode)
    const stripe = getStripe()
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: template.name,
              description: `${params.numberOfSpots} spot${params.numberOfSpots > 1 ? "s" : ""} on ${startTime.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })} at ${startTime.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
            },
            unit_amount: template.drop_in_price,
          },
          quantity: params.numberOfSpots,
        },
      ],
      payment_intent_data: {
        transfer_data: {
          destination: stripeAccount.stripe_account_id,
        },
        metadata: {
          booking_id: booking.id,
          session_template_id: params.sessionTemplateId,
          organization_id: template.organization_id,
        },
      },
      customer_email: customerEmail,
      return_url: `${baseUrl}/booking/confirmation?bookingId=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minute expiry
      metadata: {
        booking_id: booking.id,
        session_template_id: params.sessionTemplateId,
        organization_id: template.organization_id,
      },
    })

    // Update booking with checkout session ID
    await supabase
      .from("bookings")
      .update({ stripe_checkout_session_id: checkoutSession.id })
      .eq("id", booking.id)

    return {
      success: true,
      clientSecret: checkoutSession.client_secret!,
      bookingId: booking.id,
    }
  } catch (error) {
    console.error("Error in createCheckoutSession:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

/**
 * Handle successful checkout - called by webhook
 */
export async function handleCheckoutComplete(
  checkoutSessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient()

    // Get the booking by checkout session ID
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .single()

    if (bookingError || !booking) {
      return { success: false, error: "Booking not found" }
    }

    // Get payment intent ID from Stripe
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId)

    // Update booking to confirmed
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        payment_status: "completed",
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .eq("id", booking.id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in handleCheckoutComplete:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Handle expired checkout session - called by webhook
 */
export async function handleCheckoutExpired(
  checkoutSessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient()

    // Delete the pending booking to release spots
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .eq("status", "pending_payment")

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in handleCheckoutExpired:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Cancel a pending booking (e.g., when user clicks cancel on Stripe checkout)
 */
export async function cancelPendingBooking(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient()

    // Only delete if still pending
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", bookingId)
      .eq("status", "pending_payment")

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in cancelPendingBooking:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================
// V2: IMMEDIATE EMBEDDED CHECKOUT
// ============================================

export interface CreateEmbeddedCheckoutParams {
  sessionTemplateId: string
  startTime: string
  numberOfSpots: number
}

export interface CreateEmbeddedCheckoutResult {
  success: boolean
  clientSecret?: string
  error?: string
}

/**
 * Create a Stripe Embedded Checkout session WITHOUT creating a pending booking.
 * The booking will be created in the webhook when payment completes.
 * This allows showing the checkout immediately when the page loads.
 */
/**
 * Get booking details by Stripe checkout session ID
 * Used by confirmation page to look up booking created by webhook
 */
export async function getBookingByCheckoutSession(
  stripeSessionId: string
): Promise<{
  success: boolean
  bookingId?: string
  error?: string
}> {
  try {
    const supabase = createSupabaseServerClient()

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("stripe_checkout_session_id", stripeSessionId)
      .single()

    if (error || !booking) {
      return { success: false, error: "Booking not found" }
    }

    return { success: true, bookingId: booking.id }
  } catch (error) {
    console.error("Error in getBookingByCheckoutSession:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function createEmbeddedCheckoutSession(
  params: CreateEmbeddedCheckoutParams
): Promise<CreateEmbeddedCheckoutResult> {
  try {
    const { userId } = await auth()
    const supabase = createSupabaseServerClient()

    // Get session template with pricing info
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("*, organization_id")
      .eq("id", params.sessionTemplateId)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Session not found" }
    }

    if (template.pricing_type !== "paid" || !template.drop_in_price) {
      return { success: false, error: "This session does not require payment" }
    }

    // Get the organization's Stripe account
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("organization_id", template.organization_id)
      .single()

    if (stripeError || !stripeAccount) {
      return { success: false, error: "Payment not configured for this organization" }
    }

    if (!stripeAccount.charges_enabled) {
      return { success: false, error: "Payment processing is not yet enabled for this organization" }
    }

    // Get logged-in user's email (if any) to pre-fill checkout
    let customerEmail: string | undefined
    if (userId) {
      const { data: userData } = await supabase
        .from("clerk_users")
        .select("email")
        .eq("clerk_user_id", userId)
        .single()
      customerEmail = userData?.email || undefined
    }

    // Determine base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const startTime = new Date(params.startTime)

    // Create Stripe Checkout session - NO booking created yet
    // Booking will be created in webhook when payment completes
    const stripe = getStripe()
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: template.name,
              description: `${params.numberOfSpots} spot${params.numberOfSpots > 1 ? "s" : ""} on ${startTime.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })} at ${startTime.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
            },
            unit_amount: template.drop_in_price,
          },
          quantity: params.numberOfSpots,
        },
      ],
      payment_intent_data: {
        transfer_data: {
          destination: stripeAccount.stripe_account_id,
        },
        metadata: {
          session_template_id: params.sessionTemplateId,
          organization_id: template.organization_id,
          start_time: params.startTime,
          number_of_spots: params.numberOfSpots.toString(),
          clerk_user_id: userId || "",
          duration_minutes: template.duration_minutes.toString(),
        },
      },
      customer_email: customerEmail,
      // Return URL includes session_id - booking will be looked up by this
      return_url: `${baseUrl}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minute expiry
      metadata: {
        session_template_id: params.sessionTemplateId,
        organization_id: template.organization_id,
        start_time: params.startTime,
        number_of_spots: params.numberOfSpots.toString(),
        clerk_user_id: userId || "",
        duration_minutes: template.duration_minutes.toString(),
      },
    })

    return {
      success: true,
      clientSecret: checkoutSession.client_secret!,
    }
  } catch (error) {
    console.error("Error in createEmbeddedCheckoutSession:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}
