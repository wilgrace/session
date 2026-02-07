"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { SignIn, SignUp, useUser } from "@clerk/nextjs"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { useIsMobile } from "@/hooks/use-mobile"
import { checkClerkUserSynced } from "@/app/actions/session"
import { ensureClerkUser } from "@/app/actions/clerk"
import { checkWaiverAgreement } from "@/app/actions/waivers"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommunityProfileOverlay } from "./community-profile-overlay"
import { WaiverAgreementOverlay } from "./waiver-agreement-overlay"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"

// Clerk appearance - no card styling since we're in a dialog/sheet
const clerkAppearance = {
  elements: {
    rootBox: "w-full",
    card: "shadow-none border-none w-full p-0",
    cardBox: "shadow-none border-none w-full",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "bg-muted/50 border-muted rounded-xl",
    formFieldLabel: "text-foreground",
    formFieldAction: "text-primary hover:text-primary/90",
    footerActionLink: "text-primary hover:text-primary/90",
  },
}

export function AuthOverlay() {
  const {
    isOpen,
    mode,
    initialEmail,
    close,
    showProfileOverlay,
    setShowProfileOverlay,
    showWaiverOverlay,
    setShowWaiverOverlay,
    pendingWaiver,
    organizationId,
    triggerOnComplete
  } = useAuthOverlay()
  const isMobile = useIsMobile()
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser()

  // State for tracking auth completion and sync
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [authCompleted, setAuthCompleted] = useState(false)
  // Ref to prevent duplicate sync attempts (useEffect can re-run when clerkUser reference changes)
  const syncStartedRef = useRef(false)

  // Reset state when overlay opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsSyncing(false)
      setSyncError(null)
      setAuthCompleted(false)
      syncStartedRef.current = false
    }
  }, [isOpen])

  // Detect when user signs in/up and sync
  useEffect(() => {
    if (!isOpen || !isClerkLoaded || !clerkUser || authCompleted) return
    // Prevent duplicate sync attempts (effect can re-run when clerkUser reference changes)
    if (syncStartedRef.current) return
    syncStartedRef.current = true

    // Capture user for use in async function
    const user = clerkUser

    // User has authenticated - now wait for Supabase sync
    let cancelled = false

    async function waitForSync() {
      setIsSyncing(true)
      setSyncError(null)

      const clerkEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress
      const clerkUserId = user.id


      if (!clerkEmail) {
        setSyncError("No email found for user")
        setIsSyncing(false)
        return
      }

      // Poll for Supabase sync (webhook may have delay)
      let tries = 0
      let attemptedDirectCreate = false

      while (tries < 20 && !cancelled) {
        let result: { success: boolean; synced: boolean; error?: string }
        try {
          // Longer timeout for first attempt (cold start), shorter for subsequent
          const timeout = tries === 0 ? 10000 : 5000
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Server action timeout after ${timeout/1000}s`)), timeout)
          )
          result = await Promise.race([
            checkClerkUserSynced(clerkUserId, clerkEmail),
            timeoutPromise
          ])
        } catch (err) {
          // Timeout or error - continue polling (cold start may cause first attempt to fail)
          await new Promise((res) => setTimeout(res, 500))
          tries++
          continue
        }

        if (result.success && result.synced) {
          if (!cancelled) {
            setIsSyncing(false)
            setAuthCompleted(true)

            // For sign-up, check for waiver then show community profile
            // For sign-in, complete immediately
            if (mode === 'sign-up') {
              // Check if there's an active waiver that needs agreement
              if (organizationId) {
                const waiverResult = await checkWaiverAgreement(organizationId)
                if (waiverResult.success && waiverResult.data?.waiver && !waiverResult.data.hasAgreed) {
                  // Show waiver overlay first
                  setShowWaiverOverlay(true, waiverResult.data.waiver)
                  return
                }
              }
              // No waiver needed, proceed to community profile
              setShowProfileOverlay(true)
            } else {
              triggerOnComplete()
            }
          }
          return
        }

        // After 5 failed attempts (~2.5 seconds), try to create the user directly
        // This handles the case where the Clerk webhook isn't running locally
        if (tries === 5 && !attemptedDirectCreate) {
          attemptedDirectCreate = true
          const firstName = user.firstName || null
          const lastName = user.lastName || null
          await ensureClerkUser(clerkUserId, clerkEmail, firstName, lastName)
          // Continue polling - the next check should succeed
        }

        await new Promise((res) => setTimeout(res, 500))
        tries++
      }

      if (!cancelled) {
        setSyncError("Account setup is taking longer than expected. Please try again.")
        setIsSyncing(false)
      }
    }

    waitForSync()
    return () => {
      cancelled = true
    }
  }, [isOpen, isClerkLoaded, clerkUser, authCompleted, mode, organizationId, setShowProfileOverlay, setShowWaiverOverlay, triggerOnComplete])

  // Handle waiver completion
  const handleWaiverComplete = useCallback(() => {
    setShowWaiverOverlay(false, null)
    setShowProfileOverlay(true) // Proceed to community profile
  }, [setShowWaiverOverlay, setShowProfileOverlay])

  // Handle profile completion or skip
  const handleProfileComplete = useCallback(() => {
    setShowProfileOverlay(false)
    triggerOnComplete()
  }, [setShowProfileOverlay, triggerOnComplete])

  // Handle retry after sync error
  const handleRetry = () => {
    setSyncError(null)
    if (clerkUser) {
      setIsSyncing(true)
      setAuthCompleted(false)
    }
  }

  // If showing waiver overlay, render that first
  if (showWaiverOverlay && pendingWaiver) {
    return (
      <WaiverAgreementOverlay
        isOpen={true}
        waiver={pendingWaiver}
        onComplete={handleWaiverComplete}
      />
    )
  }

  // If showing community profile overlay, render that
  if (showProfileOverlay) {
    return (
      <CommunityProfileOverlay
        isOpen={true}
        onComplete={handleProfileComplete}
        onSkip={handleProfileComplete}
      />
    )
  }

  // Render content for auth forms
  const renderContent = () => {
    // Show syncing state
    if (isSyncing) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Setting up your account...</p>
        </div>
      )
    }

    // Show sync error
    if (syncError) {
      return (
        <div className="text-center space-y-4 py-8">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>{syncError}</p>
          </div>
          <Button variant="outline" onClick={handleRetry}>
            Try Again
          </Button>
        </div>
      )
    }

    // Show Clerk forms
    // We use forceRedirectUrl to prevent Clerk from redirecting to /sign-in after auth
    // This keeps the user on the current page so the overlay can handle the sync flow
    const currentUrl = typeof window !== "undefined" ? window.location.href : undefined

    if (mode === 'sign-in') {
      return (
        <SignIn
          routing="hash"
          forceRedirectUrl={currentUrl}
          appearance={clerkAppearance}
        />
      )
    }

    if (mode === 'sign-up') {
      return (
        <SignUp
          routing="hash"
          forceRedirectUrl={currentUrl}
          initialValues={{
            emailAddress: initialEmail || "",
          }}
          appearance={clerkAppearance}
        />
      )
    }

    return null
  }

  // Mobile: Bottom sheet
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-2xl"
        >
          <VisuallyHidden.Root>
            <SheetTitle>
              {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
            </SheetTitle>
            <SheetDescription>
              {mode === 'sign-in'
                ? 'Sign in to your account'
                : 'Create an account to continue'}
            </SheetDescription>
          </VisuallyHidden.Root>
          <div className="pt-2">
            {renderContent()}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Centered dialog
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <VisuallyHidden.Root>
          <DialogTitle>
            {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'sign-in'
              ? 'Sign in to your account'
              : 'Create an account to continue'}
          </DialogDescription>
        </VisuallyHidden.Root>
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}
