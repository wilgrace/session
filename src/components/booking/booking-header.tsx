"use client"

import { UserButton, SignedIn, SignedOut } from "@clerk/nextjs"
import Link from "next/link"

interface BookingHeaderProps {
  isAdmin: boolean
  slug: string
  organizationName?: string | null
}

export function BookingHeader({ isAdmin, slug, organizationName }: BookingHeaderProps) {
  return (
    <header className="border-b">
      <div className="flex h-16 items-center px-4">
        <div className="flex-1">
          <Link href={`/${slug}`} className="text-xl font-bold">
            {organizationName || "Book a Session"}
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <SignedIn>
            {isAdmin && (
              <Link
                href={`/${slug}/admin`}
                className="text-sm font-medium text-muted-foreground hover:text-primary"
              >
                Admin
              </Link>
            )}
            <UserButton afterSignOutUrl={`/${slug}`} />
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              Sign In
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
