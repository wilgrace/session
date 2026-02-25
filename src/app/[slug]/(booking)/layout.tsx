import { AuthOverlay } from "@/components/auth/auth-overlay"
import { PWAInstallWrapper } from "@/components/booking/pwa-install-wrapper"

interface BookingLayoutProps {
  children: React.ReactNode
}

export default async function BookingLayout({
  children,
}: BookingLayoutProps) {
  return (
    <div className="min-h-screen bg-white md:bg-[#F6F2EF]">
      {children}
      <AuthOverlay />
      <PWAInstallWrapper />
    </div>
  )
}
