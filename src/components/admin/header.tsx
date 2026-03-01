"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { useBookingsView } from "@/hooks/use-bookings-view"
import { useIsMobile } from "@/hooks/use-mobile"
import { CalendarView } from "@/components/admin/calendar-view"
import { BookingsSearch } from "@/components/admin/bookings-search"
import { List, Calendar, Plus, Search, X, Loader2 } from "lucide-react"
import { usePageHeaderAction } from "@/hooks/use-page-header-action"
import { cn } from "@/lib/utils"

interface HeaderProps {
  slug: string
}

export function Header({ slug }: HeaderProps) {
  const pathname = usePathname()
  const { view: sessionsView, setView: setSessionsView } = useCalendarView()
  const { view: bookingsView, setView: setBookingsView, searchQuery, setSearchQuery } = useBookingsView()
  const isMobile = useIsMobile()
  const { action: pageAction } = usePageHeaderAction()
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
      <div className="relative flex items-center justify-between">
        <h1 className="pl-6 md:pl-0 text-2xl font-semibold text-gray-900">{getPageTitle()}</h1>

        {isBookingsPage && (
          <>
            {/* Centered toggle — hidden when mobile search is expanded */}
            {!(isMobile && searchExpanded) && (
              <div className="absolute left-1/2 -translate-x-1/2">
                <div className="inline-flex rounded-md border border-gray-200 text-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBookingsView("list")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 border-r border-gray-200 transition-colors",
                      bookingsView === "list"
                        ? "bg-primary/5 text-primary font-medium"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <List className="h-4 w-4" />
                    {!isMobile && "List"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingsView("calendar")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                      bookingsView === "calendar"
                        ? "bg-primary/5 text-primary font-medium"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <Calendar className="h-4 w-4" />
                    {!isMobile && "Calendar"}
                  </button>
                </div>
              </div>
            )}

            {/* Right side: search */}
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
              <div className="flex items-center gap-2">
                {!isMobile && (
                  <BookingsSearch
                    value={searchQuery}
                    onChange={setSearchQuery}
                  />
                )}
                {isMobile && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSearchExpanded(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {isSessionsPage && (
          <>
            {/* Centered toggle */}
            <div className="absolute left-1/2 -translate-x-1/2">
              <CalendarView.Toggle />
            </div>
            {/* New Session button on the right */}
            <Button
              onClick={() => {
                const event = new CustomEvent('openSessionForm')
                window.dispatchEvent(event)
              }}
              size={isMobile ? "icon" : "default"}
              className="bg-primary"
            >
              {isMobile ? <Plus className="h-4 w-4" /> : "New Session"}
            </Button>
          </>
        )}

        {pageAction && !isBookingsPage && !isSessionsPage && (
          <Button
            onClick={pageAction.onClick}
            disabled={pageAction.loading}
            size="sm"
          >
            {pageAction.loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {pageAction.label}
          </Button>
        )}
      </div>
    </header>
  )
}
