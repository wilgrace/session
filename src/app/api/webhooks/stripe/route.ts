import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

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

  console.log(`Processing Stripe webhook: ${event.type}`)

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
          }
          break
        }

        // V2 flow: No booking_id - create booking from metadata
        const sessionTemplateId = metadata.session_template_id
        const organizationId = metadata.organization_id
        const startTimeStr = metadata.start_time
        const numberOfSpots = parseInt(metadata.number_of_spots || "1")
        const clerkUserId = metadata.clerk_user_id // Empty string for guests
        const durationMinutes = parseInt(metadata.duration_minutes || "60")

        if (!sessionTemplateId || !organizationId || !startTimeStr) {
          console.error("Missing required metadata for V2 checkout:", metadata)
          break
        }

        console.log(`V2 Checkout completed - creating booking for session ${sessionTemplateId}`)

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
            stripe_payment_intent_id: session.payment_intent as string,
            amount_paid: session.amount_total,
          })
          .select("id")
          .single()

        if (bookingError) {
          console.error("Error creating booking:", bookingError)
        } else {
          console.log(`V2 Booking ${newBooking.id} created and confirmed`)
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
