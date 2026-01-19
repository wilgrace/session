import { Suspense } from "react"
import { getPublicSessions, getUserUpcomingBookings } from "@/app/actions/session"
import { LazyBookingCalendar } from "@/components/booking/lazy-booking-calendar"
import { UpcomingBookings } from "@/components/booking/upcoming-bookings"
import { Skeleton } from "@/components/ui/skeleton"
import { auth } from "@clerk/nextjs/server"
import { BookingConfirmationToast } from "@/components/booking/booking-confirmation-toast"

export default async function BookingPage() {
  const { userId } = await auth()
  const { data: sessions, error: sessionsError } = await getPublicSessions()
  const { data: bookings, error: bookingsError } = userId
    ? await getUserUpcomingBookings(userId)
    : { data: [], error: null }

  if (sessionsError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-500">Error loading sessions: {sessionsError}</div>
      </div>
    )
  }

  return (
    <div className="h-full md:container md:mx-auto md:px-4 md:py-8">
      <BookingConfirmationToast />
      <div className="h-full flex flex-col md:grid md:gap-8">
        {userId && <UpcomingBookings bookings={bookings || []} />}

        <div className="flex-1 flex flex-col min-h-0 md:block">
          <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
            <LazyBookingCalendar sessions={sessions || []} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
