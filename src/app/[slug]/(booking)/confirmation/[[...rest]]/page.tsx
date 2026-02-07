import { getBookingDetails } from "@/app/actions/session"
import { getBookingByCheckoutSession } from "@/app/actions/checkout"
import { redirect, notFound } from "next/navigation"
import { getTenantFromHeaders } from "@/lib/tenant-utils"
import { ConfirmationPolling } from "../confirmation-polling"

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

  // If we have a Stripe session ID but no booking ID, look up the booking
  if (!bookingId && stripeSessionId) {
    const lookupResult = await getBookingByCheckoutSession(stripeSessionId)
    if (lookupResult.success && lookupResult.bookingId) {
      bookingId = lookupResult.bookingId
    } else {
      // Booking might not be created yet (webhook delay) - use polling component
      return <ConfirmationPolling stripeSessionId={stripeSessionId} slug={slug} />
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

  // Fetch booking details to get the session template ID and start time
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

  const { session, startTime } = (result as any).data
  const sessionId = session.id

  // Diagnostic logging
  console.log('Confirmation page redirect debug:', {
    hasSession: !!session,
    sessionId,
    sessionKeys: session ? Object.keys(session) : [],
    hasStartTime: !!startTime,
    startTimeValue: startTime?.toISOString?.() || String(startTime)
  })

  // Build redirect URL with confirmation flag
  const redirectParams = new URLSearchParams({
    confirmed: 'true',
    bookingId: bookingId,
  })

  if (startTime) {
    redirectParams.set('start', startTime.toISOString())
  }

  // Redirect to the session page with confirmation toast
  redirect(`/${slug}/${sessionId}?${redirectParams.toString()}`)
}
