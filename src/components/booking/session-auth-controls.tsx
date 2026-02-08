"use client"

import { SignedIn, SignedOut, useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { UserDropdown } from "@/components/booking/user-dropdown"

interface SessionAuthControlsProps {
  isAdmin: boolean
  slug: string
}

export function SessionAuthControls({ isAdmin, slug }: SessionAuthControlsProps) {
  const { openSignIn } = useAuthOverlay()
  const { isLoaded } = useAuth()

  if (!isLoaded) return <div className="w-10 h-10" />

  return (
    <div className="flex items-center gap-3">
      <SignedIn>
        <UserDropdown isAdmin={isAdmin} slug={slug} />
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
  )
}
