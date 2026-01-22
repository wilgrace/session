"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { CalendarView } from "@/components/admin/calendar-view"

interface HeaderProps {
  slug: string
}

export function Header({ slug }: HeaderProps) {
  const pathname = usePathname()
  const { view, setView } = useCalendarView()

  // Get the current page title based on the pathname
  const getPageTitle = () => {
    if (pathname === `/${slug}/admin` || pathname === `/${slug}/admin/home`) return "Bookings"
    if (pathname === `/${slug}/admin/users`) return "Users"
    if (pathname === `/${slug}/admin/sessions`) return "Sessions"
    if (pathname === `/${slug}/admin/billing`) return "Billing"
    if (pathname.startsWith("/settings")) {
      if (pathname === "/settings/general") return "General Settings"
      if (pathname === "/settings/pricing") return "Pricing Settings"
      if (pathname === "/settings/design") return "Design Settings"
      return "Settings"
    }
    return "Admin Dashboard" // Default title
  }

  // Don't render header for Bookings page (formerly Home)
  if (pathname === `/${slug}/admin` || pathname === `/${slug}/admin/home`) {
    return null
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="pl-6 md:pl-0 text-2xl font-semibold text-gray-900">{getPageTitle()}</h1>
        {pathname === `/${slug}/admin/sessions` && (
          <div className="flex items-center gap-2">
            <CalendarView.Toggle />
            <Button
              onClick={() => {
                // This will be handled by the sessions page
                const event = new CustomEvent('openSessionForm')
                window.dispatchEvent(event)
              }}
              className="bg-primary"
            >
              New Session
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
