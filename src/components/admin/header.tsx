"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { useBookingsView } from "@/hooks/use-bookings-view"
import { CalendarView } from "@/components/admin/calendar-view"
import { BookingsSearch } from "@/components/admin/bookings-search"
import { List, Calendar } from "lucide-react"

interface HeaderProps {
  slug: string
}

export function Header({ slug }: HeaderProps) {
  const pathname = usePathname()
  const { view: sessionsView, setView: setSessionsView } = useCalendarView()
  const { view: bookingsView, setView: setBookingsView, searchQuery, setSearchQuery } = useBookingsView()

  // Get the current page title based on the pathname
  const getPageTitle = () => {
    if (pathname === `/${slug}/admin` || pathname === `/${slug}/admin/home`) return "Bookings"
    if (pathname === `/${slug}/admin/users`) return "Users"
    if (pathname === `/${slug}/admin/sessions`) return "Sessions"
    if (pathname === `/${slug}/admin/billing`) return "Billing"
    if (pathname === `/${slug}/admin/settings`) return "Settings"
    return "Admin Dashboard" // Default title
  }

  const isBookingsPage = pathname === `/${slug}/admin` || pathname === `/${slug}/admin/home`
  const isSessionsPage = pathname === `/${slug}/admin/sessions`

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-40">
      <div className="flex items-center justify-between">
        <h1 className="pl-6 md:pl-0 text-2xl font-semibold text-gray-900">{getPageTitle()}</h1>

        {isBookingsPage && (
          <div className="flex items-center gap-4">
            <BookingsSearch
              value={searchQuery}
              onChange={setSearchQuery}
            />
            <div className="flex items-center gap-2">
              <Button
                variant={bookingsView === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setBookingsView("list")}
                className="flex items-center gap-2"
              >
                <List className="h-4 w-4" />
                List
              </Button>
              <Button
                variant={bookingsView === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setBookingsView("calendar")}
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Calendar
              </Button>
            </div>
          </div>
        )}

        {isSessionsPage && (
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
