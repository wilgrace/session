"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { useUser } from "@clerk/nextjs"
import type { Membership } from "@/lib/db/schema"
import { CheckoutStep } from "./checkout-step"
import { MembershipConfirmationPanel } from "./membership-confirmation-panel"
import {
  createMembershipOnlyCheckoutSession,
  checkEmailExists,
} from "@/app/actions/checkout"
import { subscribeToFreeMembership } from "@/app/actions/memberships"
import { Loader2, Check, AlertCircle } from "lucide-react"

interface MembershipSignupFormProps {
  membership: Membership
  slug: string
  organizationId: string
  mode: "signup" | "confirmation"
}

function formatPrice(priceInPence: number): string {
  if (priceInPence === 0) return "Free"
  return `£${(priceInPence / 100).toFixed(2)}`
}

export function MembershipSignupForm({
  membership,
  slug,
  organizationId,
  mode,
}: MembershipSignupFormProps) {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const { openSignUp, openSignIn } = useAuthOverlay()

  const isLoggedIn = !!user

  // Form state
  const [email, setEmail] = useState("")
  const [emailValidation, setEmailValidation] = useState<{
    valid: boolean
    requiresSignIn?: boolean
    error?: string
  } | null>(null)
  const [isValidatingEmail, setIsValidatingEmail] = useState(false)

  // Checkout state
  const [step, setStep] = useState<"form" | "checkout">("form")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auth flow state
  const [savedEmail, setSavedEmail] = useState<string | null>(null)
  const [awaitingAuthComplete, setAwaitingAuthComplete] = useState(false)

  // Set email from logged in user
  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress) {
      setEmail(user.primaryEmailAddress.emailAddress)
    }
  }, [user])

  // Continue after auth complete
  useEffect(() => {
    if (awaitingAuthComplete) return
    if (isLoggedIn && savedEmail && user) {
      handleProceedToCheckout()
      setSavedEmail(null)
    }
  }, [isLoggedIn, savedEmail, user, awaitingAuthComplete])

  // Handle confirmation mode - must be after all hooks
  if (mode === "confirmation") {
    return <MembershipConfirmationPanel membership={membership} slug={slug} />
  }

  // Email validation
  const handleEmailBlur = async () => {
    if (!email || isLoggedIn) return

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailValidation({
        valid: false,
        error: "Please enter a valid email address",
      })
      return
    }

    setIsValidatingEmail(true)
    setEmailValidation(null)

    const result = await checkEmailExists(email)

    setIsValidatingEmail(false)

    if (!result.success) {
      setEmailValidation({ valid: false, error: result.error })
      return
    }

    if (result.exists && !result.isGuestAccount) {
      // Registered user - prompt sign in
      setEmailValidation({ valid: false, requiresSignIn: true })
    } else {
      // New email or guest account - allow proceed
      setEmailValidation({ valid: true })
    }
  }

  const handleProceedToCheckout = async () => {
    setLoading(true)
    setError(null)

    try {
      // Free membership: direct subscription
      if (membership.price === 0) {
        const result = await subscribeToFreeMembership(membership.id)
        if (result.success) {
          router.push(`/${slug}/membership/${membership.id}?confirmed=true`)
        } else {
          setError(result.error || "Failed to subscribe")
        }
        setLoading(false)
        return
      }

      // Paid membership: create Stripe checkout
      const result = await createMembershipOnlyCheckoutSession({
        membershipId: membership.id,
        customerEmail: isLoggedIn ? undefined : email,
        slug,
      })

      if (result.success && result.clientSecret) {
        setClientSecret(result.clientSecret)
        setConnectedAccountId(result.connectedAccountId || null)
        setStep("checkout")
      } else {
        setError(result.error || "Failed to create checkout")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    // Guest with paid membership: require auth first
    if (!isLoggedIn && membership.price > 0) {
      setSavedEmail(email)
      setAwaitingAuthComplete(true)
      openSignUp({
        initialEmail: email,
        organizationId,
        onComplete: () => setAwaitingAuthComplete(false),
      })
      return
    }

    await handleProceedToCheckout()
  }

  // Checkout step
  if (step === "checkout" && clientSecret) {
    return (
      <CheckoutStep
        clientSecret={clientSecret}
        connectedAccountId={connectedAccountId || undefined}
        onBack={() => setStep("form")}
      />
    )
  }

  const isFree = membership.price === 0
  const canSubmit =
    isLoggedIn || (email && emailValidation?.valid) || (email && !emailValidation)

  return (
    <div className="space-y-6">
      {/* Price display */}
      <div className="text-center py-4">
        <p
          className="text-3xl font-bold text-primary"
        >
          {isFree ? "Free" : formatPrice(membership.price)}
          {!isFree && (
            <span className="text-lg font-normal text-muted-foreground">
              /{membership.billingPeriod === "yearly" ? "year" : "month"}
            </span>
          )}
        </p>
      </div>

      {/* Email input for guests */}
      {!isLoggedIn && isLoaded && (
        <div className="space-y-2">
          <Label htmlFor="email" className="text-base font-semibold">
            Email
          </Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailValidation(null)
              }}
              onBlur={handleEmailBlur}
              placeholder="your@email.com"
              className="h-12 rounded-xl bg-muted/50 pr-10"
            />
            {isValidatingEmail && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {emailValidation?.valid && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-600" />
            )}
          </div>

          {/* Email validation feedback */}
          {emailValidation?.error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {emailValidation.error}
            </p>
          )}
          {emailValidation?.requiresSignIn && (
            <div className="bg-amber-50 p-3 rounded-lg space-y-2">
              <p className="text-sm text-amber-800">
                An account with this email already exists.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openSignIn()}
                className="w-full"
              >
                Sign in to continue
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Logged in user display */}
      {isLoggedIn && user && (
        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Signing up as</p>
          <p className="font-medium">
            {user.primaryEmailAddress?.emailAddress}
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Total summary */}
      <div className="bg-muted/30 rounded-xl p-4">
        <div className="flex justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span
            className="text-xl font-bold text-primary"
          >
            {isFree ? "Free" : formatPrice(membership.price)}
          </span>
        </div>
        {!isFree && (
          <p className="text-sm text-muted-foreground mt-1">
            Billed {membership.billingPeriod === "yearly" ? "annually" : "monthly"}
          </p>
        )}
      </div>

      {/* Submit button */}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || loading || emailValidation?.requiresSignIn}
        className="w-full h-14 text-lg rounded-xl hover:opacity-90"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing...
          </>
        ) : !isLoggedIn && membership.price > 0 ? (
          "Create Account"
        ) : isFree ? (
          "Join for Free"
        ) : (
          "Subscribe"
        )}
      </Button>
    </div>
  )
}
