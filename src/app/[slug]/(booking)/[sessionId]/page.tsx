import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { SessionPageClient } from "./session-page-client"
import { notFound } from "next/navigation"
import { getTenantFromHeaders, getTenantOrganization, canAccessAdminForOrg } from "@/lib/tenant-utils"
import { getPublicSessionById, getBookingDetails } from "@/app/actions/session"

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

  // Fetch org, admin status, session data, and booking details in parallel
  const startParam = resolvedSearchParams.start
  const bookingId = resolvedSearchParams.bookingId
  const { userId } = await auth()

  const [organization, isAdmin, sessionResult, bookingResult] = await Promise.all([
    getTenantOrganization(),
    userId
      ? canAccessAdminForOrg(userId, tenant.organizationId)
      : Promise.resolve(false),
    getPublicSessionById(resolvedParams.sessionId, startParam),
    bookingId ? getBookingDetails(bookingId) : Promise.resolve(null),
  ])

  const initialSession = sessionResult.success && sessionResult.data ? sessionResult.data : null
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
        isAdmin={isAdmin}
        initialSession={initialSession}
        initialBookingDetails={initialBookingDetails}
        initialStartTimeStr={initialStartTimeStr}
      />
    </Suspense>
  )
}
