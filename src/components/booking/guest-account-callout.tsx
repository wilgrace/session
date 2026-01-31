"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { UserPlus } from "lucide-react"

interface GuestAccountCalloutProps {
  email?: string
}

export function GuestAccountCallout({ email }: GuestAccountCalloutProps) {
  const { openSignUp } = useAuthOverlay()

  const handleCreateAccount = () => {
    openSignUp({
      initialEmail: email,
      onComplete: () => {
        // Full page reload to show the upgraded user's booking
        // The webhook upgrades the guest account, so we need fresh data
        window.location.reload()
      }
    })
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <UserPlus className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-3">
            <div>
              <h4 className="font-medium text-amber-900">Complete your account</h4>
              <p className="text-sm text-amber-800">
                Create an account to manage your booking and receive updates
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleCreateAccount}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Create Account
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
