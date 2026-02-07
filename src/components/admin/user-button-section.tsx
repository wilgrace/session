"use client"

import { useEffect, useState } from "react"
import { UserButton, useUser } from "@clerk/nextjs"
import { useParams } from "next/navigation"
import { CreditCard, UserCircle } from "lucide-react"
import { isProfileComplete } from "@/app/actions/user"
import { CommunityProfileOverlay } from "@/components/auth/community-profile-overlay"

export function UserButtonSection() {
  const { isLoaded, user } = useUser()
  const params = useParams()
  const slug = params.slug as string
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [showProfileOverlay, setShowProfileOverlay] = useState(false)

  // Check if user's profile is incomplete
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

  if (!isLoaded || !user) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mt-1" />
          </div>
        </div>
      </div>
    )
  }

  const displayName = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'User'
  const email = user.emailAddresses[0]?.emailAddress || ''

  return (
    <>
      <div className="p-4 pt-2">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
          <UserButton afterSignOutUrl="/sign-in">
            <UserButton.MenuItems>
              <UserButton.Link
                label="Membership & Billing"
                labelIcon={<CreditCard size={16} />}
                href={`/${slug}/account`}
              />
              {profileIncomplete && (
                <UserButton.Action
                  label="Complete your Profile"
                  labelIcon={<UserCircle size={16} />}
                  onClick={() => setShowProfileOverlay(true)}
                />
              )}
            </UserButton.MenuItems>
          </UserButton>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>
        </div>
      </div>

      {/* Community Profile Overlay */}
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