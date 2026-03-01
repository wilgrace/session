import { Suspense } from "react"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getPublicSessionsByOrg, getUserUpcomingBookings, getUserBookedInstances } from "@/app/actions/session"
import { getPublicMembershipsForListing } from "@/app/actions/memberships"
import { LazyBookingCalendar } from "@/components/booking/lazy-booking-calendar"
import { UpcomingBookings } from "@/components/booking/upcoming-bookings"
import { BookingHeader } from "@/components/booking/booking-header"
import { Skeleton } from "@/components/ui/skeleton"
import { auth } from "@clerk/nextjs/server"
import { BookingConfirmationToast } from "@/components/booking/booking-confirmation-toast"
import { getTenantFromHeaders, getTenantOrganization, canAccessAdminForOrg } from "@/lib/tenant-utils"
import type { SessionTemplate } from "@/types/session"

interface BookingPageProps {
  params: Promise<{ slug: string }>
}

// Async server component — streams in calendar once sessions load
async function CalendarSection({
  organizationId,
  slug,
  isAdmin,
  userId,
}: {
  organizationId: string
  slug: string
  isAdmin: boolean
  userId?: string | null
}) {
  const [{ data: sessions }, bookedResult] = await Promise.all([
    getPublicSessionsByOrg(organizationId),
    userId ? getUserBookedInstances(userId, organizationId) : Promise.resolve({ data: {}, error: null }),
  ])
  return <LazyBookingCalendar sessions={sessions || []} slug={slug} isAdmin={isAdmin} bookedInstances={bookedResult.data ?? {}} />
}

// Async server component — streams in upcoming bookings
async function UpcomingBookingsSection({
  userId,
  organizationId,
  slug,
}: {
  userId: string
  organizationId: string
  slug: string
}) {
  const { data: bookings } = await getUserUpcomingBookings(userId, organizationId)
  return <UpcomingBookings bookings={bookings || []} slug={slug} />
}

export default async function BookingPage({ params }: BookingPageProps) {
  const { slug } = await params
  const tenant = await getTenantFromHeaders()

  // If middleware didn't set headers, the org doesn't exist
  if (!tenant) {
    notFound()
  }

  const { userId } = await auth()

  // Only fast fetches block the initial render
  const [organization, isAdmin, membershipsResult] = await Promise.all([
    getTenantOrganization(),
    userId
      ? canAccessAdminForOrg(userId, tenant.organizationId)
      : Promise.resolve(false),
    getPublicMembershipsForListing(tenant.organizationId),
  ])

  const memberships = membershipsResult.data?.memberships ?? []

  const showMembersButton =
    memberships.length > 0 &&
    !membershipsResult.data?.userHasActiveMembership

  const membersHref =
    memberships.length === 1
      ? `/${slug}/membership/${memberships[0].id}`
      : `/${slug}/members`

  const hasHeaderImage = !!organization?.headerImageUrl

  return (
    <>
      {/* Fixed header image - z-0, sits behind content */}
      {hasHeaderImage && (
        <div className="fixed top-0 left-0 right-0 h-[150px] md:h-[200px] z-0">
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
        {hasHeaderImage && <div className="h-[150px] md:h-[200px]" />}

        <BookingHeader
          isAdmin={isAdmin}
          slug={slug}
          organizationName={organization?.name}
          logoUrl={organization?.logoUrl}
          hasHeaderImage={hasHeaderImage}
          homepageUrl={organization?.homepageUrl}
          instagramUrl={organization?.instagramUrl}
          facebookUrl={organization?.facebookUrl}
          showMembersButton={showMembersButton}
          membersHref={membersHref}
        />

        <main
          className="flex-1 md:pb-6 pb-[env(safe-area-inset-bottom)] bg-white md:bg-[#F6F2EF]"
        >
          <div className="lg:container md:mx-auto md:px-4">
            <BookingConfirmationToast />

            <div className="flex flex-col md:grid md:gap-8">
              {userId && (
                <Suspense fallback={null}>
                  <UpcomingBookingsSection
                    userId={userId}
                    organizationId={tenant.organizationId}
                    slug={slug}
                  />
                </Suspense>
              )}

              <div className="md:block">
                <Suspense fallback={<Skeleton className="min-h-[60vh] w-full" />}>
                  <CalendarSection
                    organizationId={tenant.organizationId}
                    slug={slug}
                    isAdmin={isAdmin}
                    userId={userId}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
