"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { useBookingsView } from "@/hooks/use-bookings-view"
import { useIsMobile } from "@/hooks/use-mobile"
import { CalendarView } from "@/components/admin/calendar-view"
import { BookingsSearch } from "@/components/admin/bookings-search"
import { List, Calendar, Plus, Search, X } from "lucide-react"

interface HeaderProps {
  slug: string
}

export function Header({ slug }: HeaderProps) {
  const pathname = usePathname()
  const { view: sessionsView, setView: setSessionsView } = useCalendarView()
  const { view: bookingsView, setView: setBookingsView, searchQuery, setSearchQuery } = useBookingsView()
  const isMobile = useIsMobile()
  const [searchExpanded, setSearchExpanded] = useState(false)

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
          <>
            {/* Mobile: Expanded search takes full header */}
            {isMobile && searchExpanded ? (
              <div className="flex items-center gap-2 flex-1 ml-4">
                <BookingsSearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearchExpanded(false)
                    setSearchQuery("")
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 md:gap-4">
                {/* Desktop: Full search bar */}
                {!isMobile && (
                  <BookingsSearch
                    value={searchQuery}
                    onChange={setSearchQuery}
                  />
                )}
                {/* Mobile: Search icon button */}
                {isMobile && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSearchExpanded(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                )}
                <div className="flex items-center gap-1 md:gap-2">
                  <Button
                    variant={bookingsView === "list" ? "default" : "outline"}
                    size={isMobile ? "icon" : "sm"}
                    onClick={() => setBookingsView("list")}
                    className={isMobile ? "" : "flex items-center gap-2"}
                  >
                    <List className="h-4 w-4" />
                    {!isMobile && "List"}
                  </Button>
                  <Button
                    variant={bookingsView === "calendar" ? "default" : "outline"}
                    size={isMobile ? "icon" : "sm"}
                    onClick={() => setBookingsView("calendar")}
                    className={isMobile ? "" : "flex items-center gap-2"}
                  >
                    <Calendar className="h-4 w-4" />
                    {!isMobile && "Calendar"}
                  </Button>
                </div>
              </div>
            )}
          </>
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
              size={isMobile ? "icon" : "default"}
              className="bg-primary"
            >
              {isMobile ? <Plus className="h-4 w-4" /> : "New Session"}
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
