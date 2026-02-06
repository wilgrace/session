"use client"

import { UserButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ChevronLeft, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { cn } from "@/lib/utils"

interface BookingHeaderProps {
  isAdmin: boolean
  slug: string
  organizationName?: string | null
  logoUrl?: string | null
  hasHeaderImage?: boolean
}

export function BookingHeader({
  isAdmin,
  slug,
  organizationName,
  logoUrl,
  hasHeaderImage = false
}: BookingHeaderProps) {
  const pathname = usePathname()
  const { openSignIn } = useAuthOverlay()
  const { isLoaded } = useAuth()

  // Determine if we should show the back button (not on calendar page)
  const isCalendarPage = pathname === `/${slug}` || pathname === `/${slug}/`

  return (
    <header className="relative" style={{ backgroundColor: "#F6F2EF" }}>
      {/* Navigation row */}
      <div className="lg:container md:mx-auto flex h-16 items-center justify-between px-4 md:px-4">
        {/* Left - Home nav or back button */}
        <div className="flex items-center">
          {isCalendarPage ? (
            <span className="text-base font-medium text-gray-700 py-2">Home</span>
          ) : (
            <Link href={`/${slug}`}>
              <Button variant="ghost" size="default" className="gap-1 -ml-2 text-base py-2">
                <ChevronLeft className="h-5 w-5" />
                <span className="hidden sm:inline">Calendar</span>
              </Button>
            </Link>
          )}
        </div>

        {/* Right - Auth controls */}
        <div className="flex items-center gap-3">
          {isLoaded ? (
            <>
              <SignedIn>
                {isAdmin && (
                  <Link
                    href={`/${slug}/admin`}
                    className="hidden sm:block text-base font-medium text-muted-foreground hover:text-primary py-2"
                  >
                    Admin
                  </Link>
                )}
                <UserButton />
              </SignedIn>
              <SignedOut>
                <Button
                  onClick={() => openSignIn()}
                  size="default"
                  className="rounded-md hover:opacity-90 text-base py-2 px-4"
                  style={{
                    backgroundColor: "var(--button-color, #6c47ff)",
                    color: "var(--button-text-color, #ffffff)",
                  }}
                >
                  Sign In
                </Button>
              </SignedOut>
            </>
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>
      </div>

      {/* Centered logo with ring border */}
      <div className={cn(
        "flex justify-center pb-2",
        hasHeaderImage ? "-mt-[160px] md:-mt-[176px]" : "pt-2"
      )}>
        <Link href={`/${slug}`} className="block">
          <div className="rounded-full bg-[#F6F2EF] p-2 ring-[8px] ring-[#F6F2EF] shadow-sm">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={organizationName || "Organization logo"}
                width={200}
                height={200}
                className="h-[200px] w-[200px] rounded-full object-cover"
                priority
              />
            ) : (
              <div className="h-[200px] w-[200px] rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-4xl font-bold text-gray-600">
                  {organizationName?.charAt(0) || "S"}
                </span>
              </div>
            )}
          </div>
        </Link>
      </div>
    </header>
  )
}
