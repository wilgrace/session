"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List } from "lucide-react"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { CalendarView } from "@/components/admin/calendar-view"
import { UserButton } from "@clerk/nextjs"

export function Header() {
  const pathname = usePathname()
  const { view, setView } = useCalendarView()

  // Get the current page title based on the pathname
  const getPageTitle = () => {
    // Add console.log to debug pathname
    console.log('Current pathname:', pathname)
    
    if (pathname === "/admin/home") return "Home"
    if (pathname === "/admin/users") return "Users"
    if (pathname === "/admin/calendar") return "Calendar"
    if (pathname.startsWith("/settings")) {
      if (pathname === "/settings/general") return "General Settings"
      if (pathname === "/settings/pricing") return "Pricing Settings"
      if (pathname === "/settings/design") return "Design Settings"
      return "Settings"
    }
    return "Admin Dashboard" // Default title
  }

  // Always render the header content, regardless of pathname
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="pl-6 md:pl-0 text-2xl font-semibold text-gray-900">{getPageTitle()}</h1>
        {pathname === "/admin/calendar" && (
          <div className="flex items-center gap-2">
            <CalendarView.Toggle />
            <Button
              onClick={() => {
                // This will be handled by the calendar page
                const event = new CustomEvent('openSessionForm')
                window.dispatchEvent(event)
              }}
              className="bg-primary"
            >
              New Session
            </Button>
          </div>
        )}
        <div className="flex items-center">
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  )
}
