"use client"

import { SignedIn, SignedOut, useAuth } from "@clerk/nextjs"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { HouseIcon } from "lucide-react" 
import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { cn } from "@/lib/utils"
import { UserDropdown } from "@/components/booking/user-dropdown"

interface BookingHeaderProps {
  isAdmin: boolean
  slug: string
  organizationName?: string | null
  logoUrl?: string | null
  hasHeaderImage?: boolean
  homepageUrl?: string | null
  instagramUrl?: string | null
  facebookUrl?: string | null
}

export function BookingHeader({
  isAdmin,
  slug,
  organizationName,
  logoUrl,
  hasHeaderImage = false,
  homepageUrl,
  instagramUrl,
  facebookUrl
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
        {/* Left - Home nav, social links, or back button */}
        <div className="flex items-center gap-4">
          {isCalendarPage ? (
            <>
              {homepageUrl && (
                <a href={homepageUrl} target="_blank" rel="noopener noreferrer" className="font-medium py-2 flex gap-1 hover:opacity-70 transition-opacity">
                  <HouseIcon className="h-7 w-7 md:h-5 md:w-5 md:opacity-50" /> 
                  <span className="hidden md:block">Home</span>
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="font-medium py-2 flex gap-1 hover:opacity-70 transition-opacity">
                  <svg className="h-7 w-7 md:h-5 md:opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                  <span className="hidden md:block">Instagram</span>
                </a>
              )}
              {facebookUrl && (
                <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="font-medium py-2 flex gap-1 over:opacity-70 transition-opacity">
                  <svg className="h-7 w-7 md:h-5 md:opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                  <span className="hidden md:block">Facebook</span>
                </a>
              )}
            </>
          ) : (
            <Link href={`/${slug}`}>
              <Button variant="ghost" size="icon" className="-ml-2 h-11 w-11">
                <ChevronLeft className="h-6 w-6" />
              </Button>
            </Link>
          )}
        </div>

        {/* Right - Auth controls */}
        <div className="flex items-center gap-3">
          {isLoaded ? (
            <>
              <SignedIn>
                <UserDropdown isAdmin={isAdmin} slug={slug} />
              </SignedIn>
              <SignedOut>
                <Button
                  onClick={() => openSignIn()}
                  size="default"
                  className="rounded-md hover:opacity-90 text-base py-2 px-4"
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
        hasHeaderImage ? "-mt-[140px] md:-mt-[176px]" : "pt-2"
      )}>
        <Link href={`/${slug}`} className="block">
          <div className="rounded-full bg-[#F6F2EF] p-1 ring-[4px] ring-[#F6F2EF] md:p-2 md:ring-[8px]">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={organizationName || "Organization logo"}
                width={200}
                height={200}
                className="h-[150px] w-[150px] md:h-[200px] md:w-[200px] rounded-full object-cover"
                priority
              />
            ) : (
              <div className="h-[150px] w-[150px] md:h-[200px] md:w-[200px] rounded-full bg-gray-200 flex items-center justify-center">
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
