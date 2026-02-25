"use client"

import { SignedIn, SignedOut } from "@clerk/nextjs"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ChevronLeft, HouseIcon, Shield } from "lucide-react"
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
  showMembersButton?: boolean
  membersHref?: string
}

export function BookingHeader({
  isAdmin,
  slug,
  organizationName,
  logoUrl,
  hasHeaderImage = false,
  homepageUrl,
  instagramUrl,
  facebookUrl,
  showMembersButton = false,
  membersHref,
}: BookingHeaderProps) {
  const pathname = usePathname()
  const { openSignIn } = useAuthOverlay()

  // Determine if we should show the back button (not on calendar page)
  const isCalendarPage = pathname === `/${slug}` || pathname === `/${slug}/`
  const hasLinks = !!(homepageUrl || instagramUrl || facebookUrl)
  const showOrgName = !logoUrl && isCalendarPage

  return (
    <header className="relative bg-white md:bg-[#F6F2EF]">
      {/* Navigation row */}
      <div className="lg:container md:mx-auto relative flex h-16 items-center justify-between px-3 md:px-4">
        {/* Left - Home nav, social links, or back button */}
        <div className="flex items-center gap-4">
          {isCalendarPage ? (
            <>
              {/* Mobile-only Members button on left (replaces social icons) */}
              {showMembersButton && (
                <Button
                  asChild
                  variant="outline"
                  size="default"
                  className="md:hidden rounded-md text-base py-2 px-4"
                >
                  <Link href={membersHref ?? `/${slug}/members`}>Member</Link>
                </Button>
              )}
              {homepageUrl && (
                <a href={homepageUrl} target="_blank" rel="noopener noreferrer" className={cn("font-medium py-2 flex gap-1 hover:opacity-70 transition-opacity", showMembersButton && "hidden md:flex")}>
                  <HouseIcon className="h-7 w-7 md:h-5 md:w-5 md:opacity-50" />
                  <span className="hidden md:block">Home</span>
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={cn("font-medium py-2 flex gap-1 hover:opacity-70 transition-opacity", showMembersButton && "hidden md:flex")}>
                  <svg className="h-7 w-7 md:h-5 md:opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                  <span className="hidden md:block">Instagram</span>
                </a>
              )}
              {facebookUrl && (
                <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className={cn("font-medium py-2 flex gap-1 over:opacity-70 transition-opacity", showMembersButton && "hidden md:flex")}>
                  <svg className="h-7 w-7 md:h-5 md:opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                  <span className="hidden md:block">Facebook</span>
                </a>
              )}
              {/* Left-aligned org name when no logo and no links */}
              {showOrgName && !hasLinks && (
                <span className={cn("font-semibold text-lg", showMembersButton && "hidden md:block")}>{organizationName}</span>
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

        {/* Centered org name when no logo and has links */}
        {showOrgName && hasLinks && (
          <div className="absolute left-1/2 -translate-x-1/2">
            <span className="font-semibold text-lg">{organizationName}</span>
          </div>
        )}

        {/* Right - Auth controls */}
        <div className="flex items-center gap-3">
          {showMembersButton && (
            <Button
              asChild
              variant="outline"
              size="default"
              className="hidden md:inline-flex rounded-md text-base py-2 px-4"
            >
              <Link href={membersHref ?? `/${slug}/members`}>Members</Link>
            </Button>
          )}
          <SignedIn>
            {isAdmin && (
              <Button
                asChild
                size="default"
                className="hidden md:inline-flex gap-3 rounded-md hover:opacity-90 text-base py-2 px-4"
              >
                <Link href={`/${slug}/admin`}>
                  <Shield className="h-7 w-7 md:h-7" />
                  Staff
                </Link>
              </Button>
            )}
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
        </div>
      </div>

      {/* Centered logo with ring border - only shown when logoUrl exists */}
      {logoUrl && (
        <div className={cn(
          "flex justify-center",
          hasHeaderImage ? "-mt-[140px] md:-mt-[176px]" : "pt-2"
        )}>
          <Link href={`/${slug}`} className="block">
            <div className="rounded-full bg-[#FFFFFF] md:bg-[#F6F2EF] p-1 ring-[4px] ring-[#FFFFFF] md:ring-[#F6F2EF] md:p-2 md:ring-[8px]">
              <Image
                src={logoUrl}
                alt={organizationName || "Organization logo"}
                width={400}
                height={400}
                sizes="(min-width: 768px) 200px, 150px"
                quality={90}
                className="h-[150px] w-[150px] md:h-[200px] md:w-[200px] rounded-full object-cover"
                priority
              />
            </div>
          </Link>
        </div>
      )}

    </header>
  )
}
