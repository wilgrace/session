import { Suspense } from "react"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getPublicSessionsByOrg, getUserUpcomingBookings } from "@/app/actions/session"
import { LazyBookingCalendar } from "@/components/booking/lazy-booking-calendar"
import { UpcomingBookings } from "@/components/booking/upcoming-bookings"
import { BookingHeader } from "@/components/booking/booking-header"
import { Skeleton } from "@/components/ui/skeleton"
import { auth } from "@clerk/nextjs/server"
import { BookingConfirmationToast } from "@/components/booking/booking-confirmation-toast"
import { getTenantFromHeaders, getTenantOrganization, canAccessAdminForOrg } from "@/lib/tenant-utils"

interface BookingPageProps {
  params: Promise<{ slug: string }>
}

export default async function BookingPage({ params }: BookingPageProps) {
  const { slug } = await params
  const tenant = await getTenantFromHeaders()

  // If middleware didn't set headers, the org doesn't exist
  if (!tenant) {
    notFound()
  }

  const { userId } = await auth()
  const [organization, sessionsResult, bookingsResult] = await Promise.all([
    getTenantOrganization(),
    getPublicSessionsByOrg(tenant.organizationId),
    userId ? getUserUpcomingBookings(userId) : Promise.resolve({ data: [], error: null }),
  ])

  const { data: sessions, error: sessionsError } = sessionsResult
  const { data: bookings } = bookingsResult

  // Check if user has admin access for this org
  const isAdmin = userId && organization
    ? await canAccessAdminForOrg(userId, organization.id)
    : false

  const hasHeaderImage = !!organization?.headerImageUrl

  if (sessionsError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-500">Error loading sessions: {sessionsError}</div>
      </div>
    )
  }

  return (
    <>
      {/* Fixed header image - z-0, sits behind content */}
      {hasHeaderImage && (
        <div className="fixed top-0 left-0 right-0 h-[200px] z-0">
          <Image
            src={organization.headerImageUrl!}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        </div>
      )}

      {/* Main content - z-10, scrolls over header image */}
      <div className="relative z-10">
        {/* Transparent spacer so logo overlaps header image */}
        {hasHeaderImage && <div className="h-[200px]" />}

        <BookingHeader
          isAdmin={isAdmin}
          slug={slug}
          organizationName={organization?.name}
          logoUrl={organization?.logoUrl}
          hasHeaderImage={hasHeaderImage}
        />

        <main className="flex-1 md:pl-6 md:pr-6 md:pb-6" style={{ backgroundColor: "#F6F2EF" }}>
          <div className="lg:container md:mx-auto md:px-4">
            <BookingConfirmationToast />

            <div className="flex flex-col md:grid md:gap-8">
              {userId && <UpcomingBookings bookings={bookings || []} slug={slug} />}

              <div className="md:block">
                <Suspense fallback={<Skeleton className="min-h-[60vh] w-full" />}>
                  <LazyBookingCalendar sessions={sessions || []} slug={slug} isAdmin={isAdmin} />
                </Suspense>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
