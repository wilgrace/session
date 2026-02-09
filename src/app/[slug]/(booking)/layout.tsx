import { AuthOverlay } from "@/components/auth/auth-overlay"

interface BookingLayoutProps {
  children: React.ReactNode
}

export default async function BookingLayout({
  children,
}: BookingLayoutProps) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#F6F2EF" }}
    >
      {children}
      <AuthOverlay />
    </div>
  )
}
