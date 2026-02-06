import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { SessionPageClient } from "./session-page-client"
import { notFound } from "next/navigation"
import { getTenantFromHeaders, getTenantOrganization, canAccessAdminForOrg } from "@/lib/tenant-utils"

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

  // Fetch organization data and admin status
  const organization = await getTenantOrganization()
  const { userId } = await auth()
  const isAdmin = userId && organization
    ? await canAccessAdminForOrg(userId, organization.id)
    : false

  return (
    <Suspense fallback={
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading session details...</p>
          </div>
        </div>
      </div>
    }>
      <SessionPageClient
        sessionId={resolvedParams.sessionId}
        searchParams={resolvedSearchParams}
        slug={resolvedParams.slug}
        organizationName={organization?.name || null}
        isAdmin={isAdmin}
      />
    </Suspense>
  )
}
