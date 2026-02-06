import { AuthOverlay } from "@/components/auth/auth-overlay"
import { getTenantOrganization } from "@/lib/tenant-utils"

interface BookingLayoutProps {
  children: React.ReactNode
}

export default async function BookingLayout({
  children,
}: BookingLayoutProps) {
  const organization = await getTenantOrganization()

  // Get branding colors with defaults
  const buttonColor = organization?.buttonColor || "#6c47ff"
  const buttonTextColor = organization?.buttonTextColor || "#ffffff"

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#F6F2EF",
        "--button-color": buttonColor,
        "--button-text-color": buttonTextColor,
      } as React.CSSProperties}
    >
      {children}
      <AuthOverlay />
    </div>
  )
}
