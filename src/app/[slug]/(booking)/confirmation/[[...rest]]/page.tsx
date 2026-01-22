import { getBookingDetails } from "@/app/actions/session"
import { getBookingByCheckoutSession } from "@/app/actions/checkout"
import { redirect, notFound } from "next/navigation"
import ConfirmationClient from "../ConfirmationClient"
import { getTenantFromHeaders } from "@/lib/tenant-utils"

interface ConfirmationPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
}

export default async function ConfirmationPage({ params, searchParams }: ConfirmationPageProps) {
  const [{ slug }, queryParams] = await Promise.all([params, searchParams])
  const tenant = await getTenantFromHeaders()

  if (!tenant) {
    notFound()
  }

  let bookingId = queryParams.bookingId;
  const stripeSessionId = queryParams.session_id;

  // V2: If we have a Stripe session ID but no booking ID, look up the booking
  if (!bookingId && stripeSessionId) {
    const lookupResult = await getBookingByCheckoutSession(stripeSessionId)
    if (lookupResult.success && lookupResult.bookingId) {
      bookingId = lookupResult.bookingId
    } else {
      // Booking might not be created yet (webhook delay) - show loading message
      return (
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto text-center space-y-6">
            <h1 className="text-2xl font-bold">Processing Your Booking...</h1>
            <p className="text-muted-foreground">
              Your payment was successful! Please wait a moment while we confirm your booking.
            </p>
            <p className="text-sm text-muted-foreground">
              If this page doesn't update automatically, please refresh in a few seconds.
            </p>
          </div>
        </div>
      )
    }
  }

  if (!bookingId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto text-center space-y-6">
          <h1 className="text-2xl font-bold">No Booking Found</h1>
          <p className="text-muted-foreground">Missing booking ID. Please try booking again.</p>
        </div>
      </div>
    )
  }

  // Fetch booking, session, and user details
  const result = await getBookingDetails(bookingId)
  if (!result.success) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto text-center space-y-6">
          <h1 className="text-2xl font-bold">No Booking Found</h1>
          <p className="text-muted-foreground">{(result as any).error || "We couldn't find your booking details. Please try booking again."}</p>
        </div>
      </div>
    )
  }

  const { session, startTime, booking } = (result as any).data
  const bookingUser = booking.user
  // If the booking is associated with a real Clerk user, redirect to booking page
  if (bookingUser && bookingUser.clerk_user_id && !bookingUser.clerk_user_id.startsWith("guest_")) {
    redirect(`/${slug}`)
  }

  // Prefill Clerk SignUp for guests
  const signUpInitialValues = {
    emailAddress: bookingUser?.email || "",
    firstName: bookingUser?.first_name || "",
    lastName: bookingUser?.last_name || ""
  }

  return (
    <ConfirmationClient
      session={session}
      startTime={startTime}
      signUpInitialValues={signUpInitialValues}
      bookingDetails={{
        number_of_spots: booking.number_of_spots,
        amount_paid: booking.amount_paid,
      }}
      slug={slug}
    />
  )
}
