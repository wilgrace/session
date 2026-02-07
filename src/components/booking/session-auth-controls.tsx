"use client"

import { useEffect, useState } from "react"
import { UserButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { CreditCard, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { isProfileComplete } from "@/app/actions/user"
import { CommunityProfileOverlay } from "@/components/auth/community-profile-overlay"

interface SessionAuthControlsProps {
  isAdmin: boolean
  slug: string
}

export function SessionAuthControls({ isAdmin, slug }: SessionAuthControlsProps) {
  const { openSignIn } = useAuthOverlay()
  const { isLoaded, isSignedIn } = useAuth()
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [showProfileOverlay, setShowProfileOverlay] = useState(false)

  // Check if user's profile is incomplete
  useEffect(() => {
    async function checkProfile() {
      if (!isSignedIn) return
      const result = await isProfileComplete()
      if (result.success && result.isComplete === false) {
        setProfileIncomplete(true)
      }
    }
    checkProfile()
  }, [isSignedIn])

  if (!isLoaded) return <div className="w-10 h-10" />

  return (
    <>
      <div className="flex items-center gap-3">
        <SignedIn>
          {isAdmin && (
            <Link
              href={`/${slug}/admin`}
              className="text-sm font-medium hover:opacity-80"
              style={{ color: "var(--button-color, #6c47ff)" }}
            >
              Admin
            </Link>
          )}
          <UserButton>
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
        </SignedIn>
        <SignedOut>
          <Button
            onClick={() => openSignIn()}
            size="sm"
            className="rounded-md hover:opacity-90"
            style={{
              backgroundColor: "var(--button-color, #6c47ff)",
              color: "var(--button-text-color, #ffffff)",
            }}
          >
            Sign In
          </Button>
        </SignedOut>
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
