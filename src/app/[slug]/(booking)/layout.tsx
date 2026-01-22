import { auth } from "@clerk/nextjs/server"
import { BookingHeader } from "@/components/booking/booking-header"
import { getTenantOrganization } from "@/lib/tenant-utils"

interface BookingLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function BookingLayout({
  children,
  params,
}: BookingLayoutProps) {
  const { slug } = await params
  const organization = await getTenantOrganization()
  const { orgRole } = await auth()

  // Check if user is an admin or super admin
  const isAdmin = orgRole === 'org:admin' || orgRole === 'org:super_admin'

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <BookingHeader
        isAdmin={isAdmin}
        slug={slug}
        organizationName={organization?.name}
      />
      <main className="flex-1 overflow-auto md:p-6">{children}</main>
    </div>
  )
}
