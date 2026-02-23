"use client"

import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"

interface GuestAccountCalloutProps {
  email?: string
  organizationId?: string
}

export function GuestAccountCallout({ email, organizationId }: GuestAccountCalloutProps) {
  const { openSignUp } = useAuthOverlay()

  const handleCreateAccount = () => {
    openSignUp({
      initialEmail: email,
      organizationId,
      onComplete: () => {
        window.location.reload()
      }
    })
  }

  return (
    <Button
      className="w-full"
      onClick={handleCreateAccount}
    >
      Create an Account
    </Button>
  )
}
