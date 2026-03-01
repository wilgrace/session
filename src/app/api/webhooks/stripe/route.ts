import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { sendBookingConfirmationEmail, sendMembershipConfirmationEmail } from "@/lib/email"

// Lazy initialization to avoid build-time errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
  })
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    console.error("Missing stripe-signature header")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Log event details - 'account' field is present for Connect events
  const connectedAccountId = event.account
  console.log(`Processing Stripe webhook: ${event.type}${connectedAccountId ? ` (Connected Account: ${connectedAccountId})` : ""}`)

  const supabase = getSupabase()

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account

        const { error } = await supabase
          .from("stripe_connect_accounts")
          .update({
            details_submitted: account.details_submitted ?? false,
            charges_enabled: account.charges_enabled ?? false,
            payouts_enabled: account.payouts_enabled ?? false,
            country: account.country,
            default_currency: account.default_currency,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id)

        if (error) {
          console.error("Error updating Stripe account status:", error)
        } else {
          console.log(`Updated Stripe account status for: ${account.id}`)
          console.log(`  - details_submitted: ${account.details_submitted}`)
          console.log(`  - charges_enabled: ${account.charges_enabled}`)
          console.log(`  - payouts_enabled: ${account.payouts_enabled}`)
        }
        break
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata || {}
        const bookingId = metadata.booking_id

        // V1 flow: booking_id exists - just update the existing pending booking
        if (bookingId) {
          console.log(`Checkout completed for existing booking: ${bookingId}`)

          const { error } = await supabase
            .from("bookings")
            .update({
              status: "confirmed",
              payment_status: "completed",
              stripe_payment_intent_id: session.payment_intent as string,
              updated_at: new Date().toISOString(),
            })
            .eq("id", bookingId)
            .eq("status", "pending_payment")

          if (error) {
            console.error("Error confirming booking:", error)
          } else {
            console.log(`Booking ${bookingId} confirmed successfully`)
            // Look up organizationId for the booking to send confirmation email
            const { data: bookingRow } = await supabase
              .from("bookings")
              .select("organization_id")
              .eq("id", bookingId)
              .single()
            if (bookingRow?.organization_id) {
              await sendBookingConfirmationEmail(bookingId, bookingRow.organization_id)
            }
          }
          break
        }

        // Check if this is a membership-only purchase (no session booking)
        const isMembershipOnly = metadata.is_membership_only === "true"
        if (isMembershipOnly) {
          console.log(`Membership-only checkout completed: ${session.id}`)
          // Membership creation is handled by customer.subscription.created webhook
          break
        }

        // V2/V3 flow: No booking_id - create booking from metadata
        const sessionTemplateId = metadata.session_template_id
        const organizationId = metadata.organization_id
        const startTimeStr = metadata.start_time
        const numberOfSpots = parseInt(metadata.number_of_spots || "1")
        const clerkUserId = metadata.clerk_user_id // Empty string for guests
        const durationMinutes = parseInt(metadata.duration_minutes || "60")
        const isNewMembership = metadata.is_new_membership === "true"

        if (!sessionTemplateId || !organizationId || !startTimeStr) {
          console.error("Missing required metadata for checkout:", metadata)
          break
        }

        console.log(`Checkout completed - creating booking for session ${sessionTemplateId}, isNewMembership: ${isNewMembership}`)

        // Get customer info from Stripe (collected during checkout)
        const customerEmail = session.customer_details?.email
        const customerName = session.customer_details?.name

        if (!customerEmail) {
          console.error("No customer email in checkout session")
          break
        }

        // Find or create user
        let internalUserId: string

        if (clerkUserId) {
          // Logged-in user - look up existing
          const { data: user, error: userError } = await supabase
            .from("clerk_users")
            .select("id")
            .eq("clerk_user_id", clerkUserId)
            .single()

          if (userError || !user) {
            console.error("Error finding logged-in user:", userError)
            break
          }
          internalUserId = user.id
        } else {
          // Guest user - check if email exists, create if not
          const { data: existingUser } = await supabase
            .from("clerk_users")
            .select("id, clerk_user_id")
            .eq("email", customerEmail)
            .maybeSingle()

          if (existingUser) {
            // Reuse existing user (guest or registered)
            internalUserId = existingUser.id
          } else {
            // Create new guest user with email from Stripe
            const nameParts = (customerName || "Guest").split(" ")
            const firstName = nameParts[0] || "Guest"
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined

            const { data: guestUser, error: guestError } = await supabase
              .from("clerk_users")
              .insert({
                clerk_user_id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
                email: customerEmail,
                first_name: firstName,
                last_name: lastName,
                organization_id: organizationId,
              })
              .select("id")
              .single()

            if (guestError || !guestUser) {
              console.error("Error creating guest user:", guestError)
              break
            }
            internalUserId = guestUser.id
            console.log(`Created guest user ${internalUserId} for email ${customerEmail}`)
          }
        }

        // Find or create session instance
        const startTime = new Date(startTimeStr)
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

        let { data: instance } = await supabase
          .from("session_instances")
          .select("id")
          .eq("template_id", sessionTemplateId)
          .eq("start_time", startTime.toISOString())
          .maybeSingle()

        if (!instance) {
          const { data: newInstance, error: instanceError } = await supabase
            .from("session_instances")
            .insert({
              template_id: sessionTemplateId,
              organization_id: organizationId,
              start_time: startTime.toISOString(),
              end_time: endTime.toISOString(),
              status: "scheduled",
            })
            .select("id")
            .single()

          if (instanceError || !newInstance) {
            console.error("Error creating session instance:", instanceError)
            break
          }
          instance = newInstance
        }

        // Extract price breakdown from metadata
        const unitPrice = metadata.unit_price ? parseInt(metadata.unit_price) : null
        const discountAmount = metadata.discount_amount ? parseInt(metadata.discount_amount) : null

        // Create confirmed booking
        const { data: newBooking, error: bookingError } = await supabase
          .from("bookings")
          .insert({
            session_instance_id: instance.id,
            user_id: internalUserId,
            organization_id: organizationId,
            number_of_spots: numberOfSpots,
            status: "confirmed",
            payment_status: "completed",
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent as string || null,
            amount_paid: session.amount_total,
            unit_price: unitPrice,
            discount_amount: discountAmount,
          })
          .select("id")
          .single()

        if (bookingError) {
          console.error("Error creating booking:", bookingError)
        } else {
          console.log(`Booking ${newBooking.id} created and confirmed`)
          await sendBookingConfirmationEmail(newBooking.id, organizationId)
        }

        // Note: Membership creation is handled by customer.subscription.created webhook
        // which is triggered separately for subscription mode checkouts
        break
      }

      // ============================================
      // SUBSCRIPTION LIFECYCLE EVENTS
      // ============================================

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription
        const subMetadata = subscription.metadata || {}

        const subOrgId = subMetadata.organization_id
        const subClerkUserId = subMetadata.clerk_user_id
        const subCustomerEmail = subMetadata.customer_email
        const subMembershipId = subMetadata.membership_id // New multi-membership support

        if (!subOrgId) {
          console.error("No organization_id in subscription metadata:", subMetadata)
          break
        }

        console.log(`Subscription created: ${subscription.id} for org ${subOrgId}${subMembershipId ? `, membership ${subMembershipId}` : ""}`)

        // Find the user
        let subInternalUserId: string | null = null

        if (subClerkUserId) {
          const { data: user } = await supabase
            .from("clerk_users")
            .select("id")
            .eq("clerk_user_id", subClerkUserId)
            .single()
          subInternalUserId = user?.id || null
        }

        if (!subInternalUserId && subCustomerEmail) {
          const { data: user } = await supabase
            .from("clerk_users")
            .select("id")
            .eq("email", subCustomerEmail)
            .maybeSingle()
          subInternalUserId = user?.id || null
        }

        if (!subInternalUserId) {
          console.error("Could not find user for subscription:", subscription.id)
          break
        }

        // Create or update membership record
        const currentPeriodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : new Date().toISOString()
        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Default 30 days

        const membershipData: Record<string, unknown> = {
          user_id: subInternalUserId,
          organization_id: subOrgId,
          status: "active",
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer as string,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          cancelled_at: null,
          updated_at: new Date().toISOString(),
        }

        // Add membership_id if provided (multi-membership support)
        if (subMembershipId) {
          membershipData.membership_id = subMembershipId
        }

        const { error: membershipError } = await supabase
          .from("user_memberships")
          .upsert(
            membershipData,
            {
              onConflict: "user_id,organization_id",
            }
          )

        if (membershipError) {
          console.error("Error creating membership:", membershipError)
        } else {
          console.log(`Membership created/updated for user ${subInternalUserId}${subMembershipId ? ` with membership_id ${subMembershipId}` : ""}`)
          await sendMembershipConfirmationEmail(subInternalUserId, subOrgId, subscription.id)
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription

        console.log(`Subscription updated: ${subscription.id}`)

        // Determine new status
        let membershipStatus: "active" | "cancelled" | "expired" = "active"
        let cancelledAt: string | null = null

        if (subscription.cancel_at_period_end) {
          // User has cancelled but subscription is still active until period end
          membershipStatus = "cancelled"
          cancelledAt = subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : new Date().toISOString()
        } else if (subscription.status === "past_due" || subscription.status === "unpaid") {
          // Payment failed but not yet cancelled
          membershipStatus = "active" // Keep active, webhook for failure will handle
        } else if (subscription.status === "canceled") {
          // Fully cancelled
          membershipStatus = "expired"
        }

        const updatePeriodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : undefined
        const updatePeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : undefined

        const updateData: Record<string, unknown> = {
          status: membershipStatus,
          cancelled_at: cancelledAt,
          updated_at: new Date().toISOString(),
        }
        if (updatePeriodStart) updateData.current_period_start = updatePeriodStart
        if (updatePeriodEnd) updateData.current_period_end = updatePeriodEnd

        const { error: updateError } = await supabase
          .from("user_memberships")
          .update(updateData)
          .eq("stripe_subscription_id", subscription.id)

        if (updateError) {
          console.error("Error updating membership:", updateError)
        } else {
          console.log(`Membership updated for subscription ${subscription.id}: status=${membershipStatus}`)
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription

        console.log(`Subscription deleted: ${subscription.id}`)

        // Set membership to 'none' - subscription has fully ended
        const { error: deleteError } = await supabase
          .from("user_memberships")
          .update({
            status: "none",
            stripe_subscription_id: null,
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id)

        if (deleteError) {
          console.error("Error marking membership as none:", deleteError)
        } else {
          console.log(`Membership ended for subscription ${subscription.id}`)
        }
        break
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session
        const bookingId = session.metadata?.booking_id

        if (!bookingId) {
          console.error("No booking_id in expired checkout session metadata")
          break
        }

        console.log(`Checkout expired for booking: ${bookingId}`)

        // Delete the pending booking to release spots
        const { error } = await supabase
          .from("bookings")
          .delete()
          .eq("id", bookingId)
          .eq("status", "pending_payment") // Only delete if still pending

        if (error) {
          console.error("Error deleting expired booking:", error)
        } else {
          console.log(`Expired booking ${bookingId} deleted`)
        }
        break
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const bookingId = paymentIntent.metadata?.booking_id

        if (!bookingId) {
          // Not all payment failures are from our checkout flow
          break
        }

        console.log(`Payment failed for booking: ${bookingId}`)

        // Update booking payment status to failed
        const { error } = await supabase
          .from("bookings")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", bookingId)

        if (error) {
          console.error("Error updating failed payment status:", error)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook processing error:", error)
    // Return 200 even on processing errors to prevent Stripe retries
    // for events we've received but failed to process
    return NextResponse.json(
      { error: "Webhook processing failed", received: true },
      { status: 200 }
    )
  }
}
