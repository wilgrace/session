import { notFound } from "next/navigation"
import { getTenantFromHeaders, getTenantOrganization } from "@/lib/tenant-utils"
import { getPublicMembershipsForListing } from "@/app/actions/memberships"
import { MembersPage } from "@/components/booking/members-page"

export default async function MembersListingPage() {
  const tenant = await getTenantFromHeaders()

  if (!tenant) {
    notFound()
  }

  const [organization, membershipsResult] = await Promise.all([
    getTenantOrganization(),
    getPublicMembershipsForListing(tenant.organizationId),
  ])

  const memberships = membershipsResult.data?.memberships ?? []
  const userHasActiveMembership = membershipsResult.data?.userHasActiveMembership ?? false

  if (memberships.length === 0) {
    notFound()
  }

  return (
    <MembersPage
      memberships={memberships}
      userHasActiveMembership={userHasActiveMembership}
      slug={tenant.organizationSlug}
      organizationName={organization?.name ?? null}
    />
  )
}
