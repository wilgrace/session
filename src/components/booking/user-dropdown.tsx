"use client"

import { useEffect, useState } from "react"
import { useUser, useClerk } from "@clerk/nextjs"
import Link from "next/link"
import { Shield, CreditCard, UserCircle, Settings, LogOut, ChevronDown } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { isProfileComplete } from "@/app/actions/user"
import { CommunityProfileOverlay } from "@/components/auth/community-profile-overlay"

interface UserDropdownProps {
  isAdmin?: boolean
  slug: string
  variant?: "compact" | "sidebar"
}

export function UserDropdown({ isAdmin = false, slug, variant = "compact" }: UserDropdownProps) {
  const { user } = useUser()
  const clerk = useClerk()
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [showProfileOverlay, setShowProfileOverlay] = useState(false)

  useEffect(() => {
    async function checkProfile() {
      if (!user) return
      const result = await isProfileComplete()
      if (result.success && result.isComplete === false) {
        setProfileIncomplete(true)
      }
    }
    checkProfile()
  }, [user])

  const firstName =
    user?.firstName ||
    user?.fullName?.split(" ")[0] ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "User"

  const fullName =
    user?.fullName ||
    user?.firstName ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "User"

  const email = user?.emailAddresses[0]?.emailAddress || ""

  const initials =
    user?.firstName?.[0]?.toUpperCase() ||
    user?.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ||
    "?"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "sidebar" ? (
            <button className="flex w-full items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.imageUrl} alt={fullName} />
                <AvatarFallback className="text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
                <p className="text-xs text-gray-500 truncate">{email}</p>
              </div>
            </button>
          ) : (
            <button className="flex items-center gap-2 rounded-full p-1 hover:bg-black/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.imageUrl} alt={firstName} />
                <AvatarFallback className="text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline font-medium text-gray-700 max-w-[120px] truncate">
                {firstName}
              </span>
              <ChevronDown className="hidden md:block h-4 w-4 text-gray-500" />
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {isAdmin && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/${slug}/admin`} className="cursor-pointer">
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Area
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem asChild>
            <Link href={`/${slug}/account`} className="cursor-pointer">
              <CreditCard className="mr-2 h-4 w-4" />
              Membership & Billing
            </Link>
          </DropdownMenuItem>

          {profileIncomplete && (
            <DropdownMenuItem
              onClick={() => setShowProfileOverlay(true)}
              className="cursor-pointer"
            >
              <UserCircle className="mr-2 h-4 w-4" />
              Complete your Profile
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => clerk.openUserProfile()}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4" />
            Manage Account
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => clerk.signOut({ redirectUrl: `/${slug}` })}
            className="cursor-pointer"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommunityProfileOverlay
        isOpen={showProfileOverlay}
        onComplete={() => {
          setShowProfileOverlay(false)
          setProfileIncomplete(false)
        }}
        onSkip={() => setShowProfileOverlay(false)}
      />
    </>
  )
}
