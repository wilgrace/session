import type { Metadata } from "next"
import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { SessionPageClient } from "./session-page-client"
import { notFound, redirect } from "next/navigation"
import { getTenantFromHeaders, getTenantOrganization, canAccessAdminForOrg, getOrganizationBySlug } from "@/lib/tenant-utils"
import { getPublicSessionById, getBookingDetails, checkUserExistingBooking } from "@/app/actions/session"
import { getBookingMembershipPricingData, BookingMembershipPricingData } from "@/app/actions/memberships"
import { getBookingPriceOptionsData } from "@/app/actions/price-options"
import type { ResolvedPriceOption } from "@/lib/pricing-utils"

interface SessionPageProps {
  params: Promise<{
    slug: string
    sessionId: string
  }>
  searchParams: Promise<{
    start?: string
    edit?: string
    bookingId?: string
    membership?: string // Pre-select membership option (from sign-up redirect)
    confirmed?: string
  }>
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; sessionId: string }> }): Promise<Metadata> {
  const { slug, sessionId } = await params
  const [org, sessionResult] = await Promise.all([
    getOrganizationBySlug(slug),
    getPublicSessionById(sessionId),
  ])
  if (!org) return {}
  const session = sessionResult.data
  const sessionName = session?.name ?? "Session"
  const description = session?.description ?? `Book ${sessionName} with ${org.name}`
  const image = session?.image_url ?? org.headerImageUrl
  return {
    title: `${sessionName} – ${org.name}`,
    description,
    openGraph: {
      title: `${sessionName} – ${org.name}`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function SessionPage({ params, searchParams }: SessionPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams])
  const tenant = await getTenantFromHeaders()

  if (!tenant) {
    notFound()
  }

  // Validate sessionId
  if (!resolvedParams.sessionId) {
    notFound()
  }

  // Fetch org, admin status, session data, booking details, and existing booking check in parallel
  const startParam = resolvedSearchParams.start
  const bookingId = resolvedSearchParams.bookingId
  const { userId } = await auth()

  const [organization, isAdmin, sessionResult, bookingResult, existingBookingResult] = await Promise.all([
    getTenantOrganization(),
    userId
      ? canAccessAdminForOrg(userId, tenant.organizationId)
      : Promise.resolve(false),
    getPublicSessionById(resolvedParams.sessionId, startParam),
    bookingId ? getBookingDetails(bookingId) : Promise.resolve(null),
    // Check for existing booking server-side to avoid a client-side redirect flash
    userId && startParam && !bookingId && !resolvedSearchParams.edit
      ? checkUserExistingBooking(userId, resolvedParams.sessionId, decodeURIComponent(startParam))
      : Promise.resolve(null),
  ])

  // Server-side redirect if the user already has a booking for this instance
  if (existingBookingResult?.success && existingBookingResult.booking) {
    redirect(`/${resolvedParams.slug}/${resolvedParams.sessionId}?edit=true&bookingId=${existingBookingResult.booking.id}&start=${encodeURIComponent(startParam!)}`)
  }

  const initialSession = sessionResult.success && sessionResult.data ? sessionResult.data : null

  // Prefetch membership pricing and price options server-side — eliminates client-side waterfall
  let initialPricingData: BookingMembershipPricingData | null = null
  let initialPriceOptions: ResolvedPriceOption[] = []
  if (initialSession) {
    const instanceId = initialSession.instances?.[0]?.id
    const [pricingResult, priceOptionsResult] = await Promise.all([
      getBookingMembershipPricingData({
        organizationId: tenant.organizationId,
        dropInPrice: 0,
        sessionTemplateId: resolvedParams.sessionId,
        sessionInstanceId: instanceId,
      }),
      instanceId
        ? getBookingPriceOptionsData({
            organizationId: tenant.organizationId,
            sessionTemplateId: resolvedParams.sessionId,
            sessionInstanceId: instanceId,
          })
        : Promise.resolve(null),
    ])
    if (pricingResult.success && pricingResult.data) {
      initialPricingData = pricingResult.data
    }
    if (priceOptionsResult?.success && priceOptionsResult.data) {
      initialPriceOptions = priceOptionsResult.data.resolvedPriceOptions
    }
  }

  const initialBookingDetails =
    bookingResult && bookingResult.success
      ? (bookingResult as { success: true; data: any }).data.booking
      : null
  const initialStartTimeStr =
    bookingResult && bookingResult.success
      ? (bookingResult as { success: true; data: any }).data.startTime?.toISOString?.() ??
        String((bookingResult as { success: true; data: any }).data.startTime)
      : undefined

  return (
    <>
      {/* Preload session image — it is above the fold on both mobile and desktop (LCP candidate) */}
      {initialSession?.image_url && (
        <link
          rel="preload"
          as="image"
          href={`/_next/image?url=${encodeURIComponent(initialSession.image_url)}&w=828&q=75`}
          fetchPriority="high"
        />
      )}
      <Suspense
        fallback={
          <div className="container mx-auto py-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading session details...</p>
              </div>
            </div>
          </div>
        }
      >
        <SessionPageClient
          sessionId={resolvedParams.sessionId}
          searchParams={resolvedSearchParams}
          slug={resolvedParams.slug}
          organizationName={organization?.name || null}
          cancellationWindowHours={organization?.cancellationWindowHours ?? 0}
          isAdmin={isAdmin}
          initialSession={initialSession}
          initialBookingDetails={initialBookingDetails}
          initialStartTimeStr={initialStartTimeStr}
          initialPricingData={initialPricingData}
          initialPriceOptions={initialPriceOptions}
        />
      </Suspense>
    </>
  )
}
