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

// Email check types
export interface EmailCheckResult {
  success: boolean
  exists: boolean
  isGuestAccount: boolean
  error?: string
}

// Coupon validation types
export interface CouponValidationResult {
  success: boolean
  valid: boolean
  coupon?: {
    id: string
    percentOff?: number
    amountOff?: number // in pence
    currency?: string
    name?: string
  }
  error?: string
}

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Check if an email exists in the clerk_users table
 * Used to determine if a guest should sign in or can proceed
 */
export async function checkEmailExists(
  email: string
): Promise<EmailCheckResult> {
  try {
    const supabase = createSupabaseServerClient()

    const { data: user, error } = await supabase
      .from("clerk_users")
      .select("clerk_user_id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle()

    if (error) {
      console.error("Error checking email:", error)
      return { success: false, exists: false, isGuestAccount: false, error: error.message }
    }

    if (!user) {
      return { success: true, exists: false, isGuestAccount: false }
    }

    // Check if it's a guest account (clerk_user_id starts with "guest_")
    const isGuestAccount = user.clerk_user_id.startsWith("guest_")

    return { success: true, exists: true, isGuestAccount }
  } catch (error) {
    console.error("Error in checkEmailExists:", error)
    return {
      success: false,
      exists: false,
      isGuestAccount: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Validate a coupon/promotion code against Stripe
 * Uses the organization's connected Stripe account
 */
export async function validateCoupon(
  couponCode: string,
  organizationId: string
): Promise<CouponValidationResult> {
  try {
    const supabase = createSupabaseServerClient()

    // Get connected Stripe account
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id")
      .eq("organization_id", organizationId)
      .single()

    if (stripeError || !stripeAccount) {
      return { success: false, valid: false, error: "Payment not configured for this organization" }
    }

    const stripe = getStripe()

    // Search for promotion code on connected account
    const promotionCodes = await stripe.promotionCodes.list(
      { code: couponCode.toUpperCase().trim(), active: true, limit: 1 },
      { stripeAccount: stripeAccount.stripe_account_id }
    )

    if (promotionCodes.data.length === 0) {
      return { success: true, valid: false, error: "Invalid or expired code" }
    }

    const promoCode = promotionCodes.data[0]

    // The coupon ID is nested under promotion.coupon in the API response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promoCodeAny = promoCode as any
    const couponId = promoCodeAny.promotion?.coupon || promoCode.coupon

    if (!couponId) {
      console.error("Coupon ID not found on promotion code:", promoCode.id)
      return { success: false, valid: false, error: "Coupon configuration error" }
    }

    // Fetch the full coupon object from the connected account
    const couponIdStr = typeof couponId === "string" ? couponId : couponId.id
    const fullCoupon = await stripe.coupons.retrieve(
      couponIdStr,
      { stripeAccount: stripeAccount.stripe_account_id }
    )

    return {
      success: true,
      valid: true,
      coupon: {
        id: promoCode.id, // Use promotion code ID for checkout
        percentOff: fullCoupon.percent_off ?? undefined,
        amountOff: fullCoupon.amount_off ?? undefined,
        currency: fullCoupon.currency || "gbp",
        name: fullCoupon.name || promoCode.code,
      },
    }
  } catch (error) {
    console.error("Error in validateCoupon:", error)
    return {
      success: false,
      valid: false,
      error: error instanceof Error ? error.message : "Validation failed",
    }
  }
}

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
  customerEmail?: string // For guest users
  promotionCode?: string // Validated promotion code ID
  pricingType?: "drop_in" | "membership"
  isNewMembership?: boolean // True if user is signing up for membership
  slug: string // Organization slug for return URL
}

export interface CreateEmbeddedCheckoutResult {
  success: boolean
  clientSecret?: string
  connectedAccountId?: string // For subscription checkouts on Connected Account
  bookingId?: string // Only for zero-price bypass (direct booking without Stripe)
  zeroPrice?: boolean // True if booking was created directly (no payment needed)
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

    // Get the organization's Stripe account with membership info
    const { data: stripeAccount, error: stripeError } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled, membership_price_id, membership_monthly_price")
      .eq("organization_id", template.organization_id)
      .single()

    if (stripeError || !stripeAccount) {
      return { success: false, error: "Payment not configured for this organization" }
    }

    if (!stripeAccount.charges_enabled) {
      return { success: false, error: "Payment processing is not yet enabled for this organization" }
    }

    // Get organization pricing settings
    const { data: org } = await supabase
      .from("organizations")
      .select("member_price_type, member_discount_percent, member_fixed_price")
      .eq("id", template.organization_id)
      .single()

    // Determine customer email and internal user ID
    let customerEmail: string | undefined = params.customerEmail
    let internalUserId: string | null = null

    if (userId) {
      const { data: userData } = await supabase
        .from("clerk_users")
        .select("id, email")
        .eq("clerk_user_id", userId)
        .single()
      customerEmail = userData?.email || params.customerEmail
      internalUserId = userData?.id || null
    }

    // Check if user has active membership
    let isActiveMember = false
    if (internalUserId) {
      const { getMembershipForUser } = await import("@/app/actions/membership")
      const { isMembershipActive } = await import("@/lib/pricing-utils")
      const membership = await getMembershipForUser(internalUserId, template.organization_id)
      isActiveMember = isMembershipActive(membership)
    }

    // Calculate member price using pricing utilities
    const { calculateMemberPrice, calculateBookingPrice } = await import("@/lib/pricing-utils")
    const memberPrice = calculateMemberPrice({
      dropInPrice: template.drop_in_price,
      templateMemberPrice: template.member_price,
      orgMemberPriceType: org?.member_price_type as "discount" | "fixed" | null,
      orgMemberDiscountPercent: org?.member_discount_percent,
      orgMemberFixedPrice: org?.member_fixed_price,
    })

    // Calculate pricing breakdown
    const priceBreakdown = calculateBookingPrice(
      {
        numberOfSpots: params.numberOfSpots,
        isMember: isActiveMember,
        isNewMembership: params.isNewMembership || false,
        dropInPrice: template.drop_in_price,
        memberPrice,
      },
      stripeAccount.membership_monthly_price
    )

    // Determine checkout mode
    const isNewMembership = params.isNewMembership && !isActiveMember
    const checkoutMode = isNewMembership ? "subscription" : "payment"

    // Validate new membership requirements
    if (isNewMembership) {
      if (!stripeAccount.membership_price_id) {
        return { success: false, error: "Membership is not configured for this organization" }
      }
      if (params.numberOfSpots > 1) {
        return { success: false, error: "New membership purchases can only be for 1 person. Book additional spots separately after completing membership signup." }
      }
    }

    // Calculate discount if promotion code is provided
    let discountAmount = 0
    if (params.promotionCode && checkoutMode === "payment") {
      const stripe = getStripe()
      try {
        // Fetch the promotion code to get coupon details
        const promoCode = await stripe.promotionCodes.retrieve(
          params.promotionCode,
          { stripeAccount: stripeAccount.stripe_account_id }
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const promoCodeAny = promoCode as any
        const couponId = promoCodeAny.promotion?.coupon || promoCodeAny.coupon

        if (couponId) {
          const couponIdStr = typeof couponId === "string" ? couponId : couponId.id
          const coupon = await stripe.coupons.retrieve(
            couponIdStr,
            { stripeAccount: stripeAccount.stripe_account_id }
          )

          // Calculate discount (only on session price, not membership fee)
          const sessionTotal = priceBreakdown.person1Price + (priceBreakdown.additionalPersonPrice * priceBreakdown.additionalPeople)
          if (coupon.percent_off) {
            discountAmount = Math.round(sessionTotal * (coupon.percent_off / 100))
          } else if (coupon.amount_off) {
            discountAmount = Math.min(coupon.amount_off, sessionTotal)
          }
        }
      } catch (err) {
        console.error("Error fetching promotion code for discount calculation:", err)
        // Continue without discount calculation - Stripe will still apply it
      }
    }

    // Calculate final total after discount
    const finalTotal = priceBreakdown.total - discountAmount

    // ZERO-PRICE BYPASS: If total is £0 (after discount) and no membership, create booking directly
    if (finalTotal <= 0 && !isNewMembership) {
      // Create booking directly without Stripe
      const booking = await createDirectBooking({
        sessionTemplateId: params.sessionTemplateId,
        startTime: params.startTime,
        numberOfSpots: params.numberOfSpots,
        organizationId: template.organization_id,
        clerkUserId: userId || null,
        customerEmail: customerEmail || null,
        durationMinutes: template.duration_minutes,
      })

      if (!booking.success) {
        return { success: false, error: booking.error || "Failed to create booking" }
      }

      return {
        success: true,
        bookingId: booking.bookingId,
        zeroPrice: true,
      }
    }

    // Determine base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const startTime = new Date(params.startTime)

    // Build line items based on checkout mode
    const stripe = getStripe()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineItems: any[] = []

    if (checkoutMode === "subscription") {
      // Subscription mode: Add recurring membership + one-off session

      // 1. Monthly membership (recurring)
      lineItems.push({
        price: stripeAccount.membership_price_id,
        quantity: 1,
      })

      // 2. Session at member rate (one-off)
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: `${template.name} (Member Rate)`,
            description: `Session on ${startTime.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })} at ${startTime.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          },
          unit_amount: priceBreakdown.person1Price,
        },
        quantity: 1,
      })
    } else {
      // Payment mode: session booking only

      // Person 1 (member rate if applicable)
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: template.name + (isActiveMember ? " (Member Rate)" : ""),
            description: `${startTime.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })} at ${startTime.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          },
          unit_amount: priceBreakdown.person1Price,
        },
        quantity: 1,
      })

      // Additional people at drop-in rate
      if (priceBreakdown.additionalPeople > 0) {
        lineItems.push({
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${template.name} (Additional Guest)`,
              description: `Additional spot(s)`,
            },
            unit_amount: priceBreakdown.additionalPersonPrice,
          },
          quantity: priceBreakdown.additionalPeople,
        })
      }
    }

    // Build checkout session config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkoutConfig: any = {
      mode: checkoutMode,
      ui_mode: "embedded",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: customerEmail,
      return_url: `${baseUrl}/${params.slug}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minute expiry
      metadata: {
        session_template_id: params.sessionTemplateId,
        organization_id: template.organization_id,
        start_time: params.startTime,
        number_of_spots: params.numberOfSpots.toString(),
        clerk_user_id: userId || "",
        duration_minutes: template.duration_minutes.toString(),
        customer_email: customerEmail || "",
        pricing_type: params.pricingType || "drop_in",
        is_new_membership: isNewMembership ? "true" : "false",
        promotion_code: params.promotionCode || "",
        // Price breakdown for confirmation display
        unit_price: priceBreakdown.person1Price.toString(),
        discount_amount: discountAmount.toString(),
      },
    }

    // Apply promotion code if provided
    if (params.promotionCode) {
      checkoutConfig.discounts = [{ promotion_code: params.promotionCode }]
    }

    // Add mode-specific config
    if (checkoutMode === "subscription") {
      // Subscription mode - created on CONNECTED ACCOUNT
      // No transfer_data needed since checkout lives on their account
      checkoutConfig.subscription_data = {
        metadata: {
          organization_id: template.organization_id,
          clerk_user_id: userId || "",
          customer_email: customerEmail || "",
          session_template_id: params.sessionTemplateId,
          start_time: params.startTime,
          number_of_spots: params.numberOfSpots.toString(),
          duration_minutes: template.duration_minutes.toString(),
        },
      }
    } else {
      // Payment mode - also created on CONNECTED ACCOUNT (so promotion codes work)
      // The connected account receives the payment directly
      checkoutConfig.payment_intent_data = {
        metadata: {
          session_template_id: params.sessionTemplateId,
          organization_id: template.organization_id,
          start_time: params.startTime,
          number_of_spots: params.numberOfSpots.toString(),
          clerk_user_id: userId || "",
          duration_minutes: template.duration_minutes.toString(),
          customer_email: customerEmail || "",
          pricing_type: params.pricingType || "drop_in",
          promotion_code: params.promotionCode || "",
        },
      }
    }

    // Create checkout session on Connected Account
    // This allows using promotion codes created on the connected account
    const checkoutSession = await stripe.checkout.sessions.create(
      checkoutConfig,
      { stripeAccount: stripeAccount.stripe_account_id }
    )

    return {
      success: true,
      // All checkouts are now on Connected Account (for promotion code support)
      connectedAccountId: stripeAccount.stripe_account_id,
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

/**
 * Create a booking directly without Stripe (for zero-price bookings)
 */
async function createDirectBooking(params: {
  sessionTemplateId: string
  startTime: string
  numberOfSpots: number
  organizationId: string
  clerkUserId: string | null
  customerEmail: string | null
  durationMinutes: number
}): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  try {
    const supabase = createSupabaseServerClient()

    // Find or create user
    let internalUserId: string

    if (params.clerkUserId) {
      const { data: user, error: userError } = await supabase
        .from("clerk_users")
        .select("id")
        .eq("clerk_user_id", params.clerkUserId)
        .single()

      if (userError || !user) {
        return { success: false, error: "User not found" }
      }
      internalUserId = user.id
    } else if (params.customerEmail) {
      // Check for existing user by email
      const { data: existingUser } = await supabase
        .from("clerk_users")
        .select("id, clerk_user_id")
        .eq("email", params.customerEmail)
        .maybeSingle()

      if (existingUser) {
        if (!existingUser.clerk_user_id.startsWith("guest_")) {
          return { success: false, error: "Please sign in to continue" }
        }
        internalUserId = existingUser.id
      } else {
        // Create guest user
        const { data: guestUser, error: guestError } = await supabase
          .from("clerk_users")
          .insert({
            clerk_user_id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
            email: params.customerEmail,
            organization_id: params.organizationId,
          })
          .select("id")
          .single()

        if (guestError || !guestUser) {
          return { success: false, error: "Failed to create user" }
        }
        internalUserId = guestUser.id
      }
    } else {
      return { success: false, error: "Email required for booking" }
    }

    // Find or create session instance
    const startTime = new Date(params.startTime)
    const endTime = new Date(startTime.getTime() + params.durationMinutes * 60 * 1000)

    let { data: instance } = await supabase
      .from("session_instances")
      .select("id")
      .eq("template_id", params.sessionTemplateId)
      .eq("start_time", startTime.toISOString())
      .maybeSingle()

    if (!instance) {
      const { data: newInstance, error: instanceError } = await supabase
        .from("session_instances")
        .insert({
          template_id: params.sessionTemplateId,
          organization_id: params.organizationId,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: "scheduled",
        })
        .select("id")
        .single()

      if (instanceError || !newInstance) {
        return { success: false, error: "Failed to create session instance" }
      }
      instance = newInstance
    }

    // Create confirmed booking (no payment needed)
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        session_instance_id: instance.id,
        user_id: internalUserId,
        organization_id: params.organizationId,
        number_of_spots: params.numberOfSpots,
        status: "confirmed",
        payment_status: "not_required",
        amount_paid: 0,
      })
      .select("id")
      .single()

    if (bookingError || !booking) {
      return { success: false, error: "Failed to create booking" }
    }

    return { success: true, bookingId: booking.id }
  } catch (error) {
    console.error("Error in createDirectBooking:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
