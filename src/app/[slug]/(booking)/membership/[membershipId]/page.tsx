import { Suspense } from "react"
import { MembershipPageClient } from "./membership-page-client"
import { notFound } from "next/navigation"
import { getTenantFromHeaders, getTenantOrganization } from "@/lib/tenant-utils"

interface MembershipPageProps {
  params: Promise<{
    slug: string
    membershipId: string
  }>
  searchParams: Promise<{
    confirmed?: string
    session_id?: string
  }>
}

export default async function MembershipPage({
  params,
  searchParams,
}: MembershipPageProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const tenant = await getTenantFromHeaders()

  if (!tenant) {
    notFound()
  }

  // Validate membershipId
  if (!resolvedParams.membershipId) {
    notFound()
  }

  // Fetch organization data
  const organization = await getTenantOrganization()

  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading membership details...</p>
            </div>
          </div>
        </div>
      }
    >
      <MembershipPageClient
        membershipId={resolvedParams.membershipId}
        searchParams={resolvedSearchParams}
        slug={resolvedParams.slug}
        organizationName={organization?.name || null}
        organizationId={tenant.organizationId}
      />
    </Suspense>
  )
}
