import { Suspense } from "react"
import { AuthOverlay } from "@/components/auth/auth-overlay"
import { BrandingProvider } from "@/components/auth/branding-provider"
import { PWAInstallWrapper } from "@/components/booking/pwa-install-wrapper"
import { getTenantOrganization } from "@/lib/tenant-utils"

interface BookingLayoutProps {
  children: React.ReactNode
}

export default async function BookingLayout({
  children,
}: BookingLayoutProps) {
  const org = await getTenantOrganization()

  return (
    <div className="min-h-screen bg-white md:bg-[#F6F2EF]">
      {children}
      <BrandingProvider
        logoUrl={org?.logoUrl}
        brandColor={org?.brandColor}
        brandTextColor={org?.brandTextColor}
      />
      <AuthOverlay />
      <Suspense>
        <PWAInstallWrapper orgName={org?.name} slug={org?.slug} />
      </Suspense>
    </div>
  )
}
