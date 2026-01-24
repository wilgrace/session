import { auth } from "@clerk/nextjs/server"
import { BookingHeader } from "@/components/booking/booking-header"
import { getTenantOrganization, isUserSuperAdmin } from "@/lib/tenant-utils"

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
  const { userId } = await auth()

  // Check if user is a super admin from Supabase clerk_users table
  const isAdmin = userId ? await isUserSuperAdmin(userId) : false

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
