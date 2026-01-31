"use client"

import { UserButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"

interface BookingHeaderProps {
  isAdmin: boolean
  slug: string
  organizationName?: string | null
}

export function BookingHeader({ isAdmin, slug, organizationName }: BookingHeaderProps) {
  const pathname = usePathname()
  const { openSignIn } = useAuthOverlay()
  const { isLoaded } = useAuth()

  // Determine if we should show the back button (not on calendar page)
  const isCalendarPage = pathname === `/${slug}` || pathname === `/${slug}/`
  const showBackButton = !isCalendarPage

  return (
    <header className="border-b">
      <div className="flex h-16 items-center px-4">
        {/* Left section - Back button */}
        <div className="w-24 flex items-center">
          {showBackButton && (
            <Link href={`/${slug}`}>
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Calendar</span>
              </Button>
            </Link>
          )}
        </div>

        {/* Center section - Logo/Org name */}
        <div className="flex-1 flex justify-center">
          <Link
            href={`/${slug}`}
            className="text-lg sm:text-xl font-bold truncate max-w-[200px] sm:max-w-none"
          >
            {organizationName || "Book a Session"}
          </Link>
        </div>

        {/* Right section - Auth actions */}
        <div className="w-24 flex items-center justify-end gap-3">
          {isLoaded ? (
            <>
              <SignedIn>
                {isAdmin && (
                  <Link
                    href={`/${slug}/admin`}
                    className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-primary"
                  >
                    Admin
                  </Link>
                )}
                <UserButton afterSignOutUrl={`/${slug}`} />
              </SignedIn>
              <SignedOut>
                <Button
                  onClick={() => openSignIn()}
                  size="sm"
                  className="rounded-md"
                >
                  Sign In
                </Button>
              </SignedOut>
            </>
          ) : (
            // Placeholder while Clerk is loading
            <div className="w-8 h-8" />
          )}
        </div>
      </div>
    </header>
  )
}
