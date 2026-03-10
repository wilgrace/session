import type { Metadata } from "next"
import { Suspense } from "react"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getPublicSessionsByOrg, getUserUpcomingBookings, getUserBookedInstances } from "@/app/actions/session"
import { getPublicMembershipsForListing, getFilterableMemberships } from "@/app/actions/memberships"
import { getPublicPriceOptions } from "@/app/actions/price-options"
import { LazyBookingCalendar } from "@/components/booking/lazy-booking-calendar"
import { UpcomingBookings } from "@/components/booking/upcoming-bookings"
import { BookingHeader } from "@/components/booking/booking-header"
import { Skeleton } from "@/components/ui/skeleton"
import { auth } from "@clerk/nextjs/server"
import { BookingConfirmationToast } from "@/components/booking/booking-confirmation-toast"
import { getTenantFromHeaders, getTenantOrganization, canAccessAdminForOrg, getOrganizationBySlug } from "@/lib/tenant-utils"
import type { SessionTemplate } from "@/types/session"

interface BookingPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string }>
}

export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)
  if (!org) return {}
  return {
    title: org.name,
    description: org.description ?? `Book sessions with ${org.name}`,
    openGraph: {
      title: org.name,
      description: org.description ?? `Book sessions with ${org.name}`,
      ...(org.headerImageUrl ? { images: [org.headerImageUrl] } : {}),
    },
  }
}

// Async server component — streams in calendar once sessions load
async function CalendarSection({
  organizationId,
  slug,
  isAdmin,
  userId,
  initialDate,
}: {
  organizationId: string
  slug: string
  isAdmin: boolean
  userId?: string | null
  initialDate?: string
}) {
  const [{ data: sessions }, bookedResult, priceOptionsResult, membershipsResult] = await Promise.all([
    getPublicSessionsByOrg(organizationId),
    userId ? getUserBookedInstances(userId, organizationId) : Promise.resolve({ data: {}, error: null }),
    getPublicPriceOptions(organizationId),
    getFilterableMemberships(organizationId),
  ])
  const filterablePriceOptions = (priceOptionsResult.data ?? []).filter(o => o.includeInFilter)
  const filterableMemberships = membershipsResult.data ?? []
  return <LazyBookingCalendar sessions={sessions || []} slug={slug} isAdmin={isAdmin} bookedInstances={bookedResult.data ?? {}} initialDate={initialDate} filterablePriceOptions={filterablePriceOptions} filterableMemberships={filterableMemberships} />
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

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const { slug } = await params
  const { date: initialDate } = await searchParams
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
        <>
          {/* Preload hint hoisted to <head> by React 19 — makes LCP image discoverable
              during initial HTML parse. imageSrcSet mirrors Next.js default deviceSizes
              so the browser reuses the preloaded response for the <img> srcset below. */}
          <link
            rel="preload"
            as="image"
            imageSrcSet={[640, 750, 828, 1080, 1200, 1920, 2048, 3840]
              .map(w => `/_next/image?url=${encodeURIComponent(organization.headerImageUrl!)}&w=${w}&q=75 ${w}w`)
              .join(", ")}
            imageSizes="100vw"
            fetchPriority="high"
          />
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
        </>
      )}

      {/* Main content - z-10, scrolls over header image */}
      <div className="relative z-10">
        {/* Transparent spacer so logo overlaps header image */}
        {hasHeaderImage && (
          <div className="relative h-[150px] md:h-[200px]">
            {/* Mobile-only social links overlay — shown over the header image */}
            {(organization?.homepageUrl || organization?.instagramUrl || organization?.facebookUrl) && (
              <div className="md:hidden absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-3 z-10">
                {/* Left: Home */}
                <div>
                  {organization.homepageUrl && (
                    <a href={organization.homepageUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center justify-center h-9 w-9 rounded-full bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    </a>
                  )}
                </div>
                {/* Right: Social links */}
                <div className="flex gap-2">
                  {organization.instagramUrl && (
                    <a href={organization.instagramUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center justify-center h-9 w-9 rounded-full bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                      </svg>
                    </a>
                  )}
                  {organization.facebookUrl && (
                    <a href={organization.facebookUrl} target="_blank" rel="noopener noreferrer"
                       className="flex items-center justify-center h-9 w-9 rounded-full bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
                    initialDate={initialDate}
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
