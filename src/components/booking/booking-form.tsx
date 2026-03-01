"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { SessionTemplate } from "@/types/session"
import { useUser } from "@clerk/nextjs"
import { createBooking } from "@/app/actions/session"
import { getClerkUser } from "@/app/actions/clerk"
import { createClerkUser } from "@/app/actions/clerk"
import { createEmbeddedCheckoutSession } from "@/app/actions/checkout"
import { getActiveWaiver, checkWaiverAgreement } from "@/app/actions/waivers"
import { PreCheckoutForm, CheckoutFormData, MembershipPricingOption } from "./pre-checkout-form"
import { CheckoutStep } from "./checkout-step"
import { BookingPanel } from "./booking-panel"
import { WaitingListForm } from "./waiting-list-form"
import { WaiverAgreementOverlay } from "@/components/auth/waiver-agreement-overlay"
import type { Waiver } from "@/lib/db/schema"
import { Loader2 } from "lucide-react"

type BookingMode = 'new' | 'edit' | 'confirmation'

interface BookingFormProps {
  session: SessionTemplate
  startTime?: Date
  bookingDetails?: {
    id: string
    notes?: string
    number_of_spots: number
    amount_paid?: number | null
    unit_price?: number | null
    discount_amount?: number | null
  }
  slug: string
  sessionId?: string // Session template ID for sharing links
  sessionInstanceId?: string // Session instance ID (needed for waiting list)
  spotsRemaining?: number
  // Multi-membership pricing props
  memberships?: MembershipPricingOption[]
  userMembershipId?: string | null
  userMembershipDisabled?: boolean
  userMembershipName?: string | null
  // Backward compatible membership pricing props
  memberPrice?: number
  monthlyMembershipPrice?: number | null
  isActiveMember?: boolean
  // Pre-select membership option (from sign-up redirect)
  defaultToMembership?: boolean
  // Mode for rendering different views
  mode?: BookingMode
  // Callback when checkout step changes (for mobile layout adjustments)
  onStepChange?: (step: "form" | "checkout") => void
  // User details for edit/confirmation modes
  userDetails?: {
    name: string
    email: string
  } | null
  // Guest status for edit/confirmation modes
  isGuest?: boolean
  guestEmail?: string
  isAdmin?: boolean
}

type CheckoutStepType = "form" | "checkout"

export function BookingForm({
  session,
  startTime,
  bookingDetails,
  slug,
  sessionId,
  sessionInstanceId,
  spotsRemaining = session.capacity,
  memberships = [],
  userMembershipId,
  userMembershipDisabled = false,
  userMembershipName = null,
  memberPrice = 0,
  monthlyMembershipPrice = null,
  isActiveMember = false,
  defaultToMembership = false,
  mode = 'new',
  onStepChange,
  userDetails,
  isGuest = false,
  guestEmail,
  isAdmin = false,
}: BookingFormProps) {
  const { user } = useUser()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState(bookingDetails?.notes || "")
  const [numberOfSpots, setNumberOfSpots] = useState(bookingDetails?.number_of_spots || 1)
  const [isEditMode, setIsEditMode] = useState(!!bookingDetails)
  const [bookingId, setBookingId] = useState<string | null>(bookingDetails?.id || null)

  // 2-step checkout state for paid sessions
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStepType>("form")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null)
  const [checkoutFormData, setCheckoutFormData] = useState<CheckoutFormData | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Waiver state
  const [activeWaiver, setActiveWaiver] = useState<Waiver | null>(null)
  const [waiverNeeded, setWaiverNeeded] = useState(false)
  const [showWaiverOverlay, setShowWaiverOverlay] = useState(false)
  const [pendingCheckoutData, setPendingCheckoutData] = useState<CheckoutFormData | null>(null)
  const [pendingFreeSubmit, setPendingFreeSubmit] = useState(false)
  const [pendingFreeFormData, setPendingFreeFormData] = useState<CheckoutFormData | null>(null)

  // Determine if this is a paid session (not in edit mode)
  // Note: drop_in_price being null/0 does NOT mean the session is free — it may be membership-only
  const isPaidSession = session.pricing_type === "paid" && !isEditMode

  // NOTE: All hooks must be called before any conditional returns
  // The BookingPanel return is moved below this useEffect to comply with React's rules of hooks
  useEffect(() => {
    if (bookingDetails) {
      setNotes(bookingDetails.notes || "")
      setNumberOfSpots(bookingDetails.number_of_spots)
      setBookingId(bookingDetails.id)
      setIsEditMode(true)
    }
  }, [bookingDetails])

  // Notify parent when checkout step changes (for mobile layout adjustments)
  useEffect(() => {
    onStepChange?.(checkoutStep)
  }, [checkoutStep, onStepChange])

  // Fetch active waiver and check if user has already agreed
  useEffect(() => {
    if (mode !== 'new') return

    // Reset immediately so stale `true` from a previous run (e.g. guest state)
    // doesn't trigger the waiver overlay while the async check is in flight
    setWaiverNeeded(false)

    async function checkWaiver() {
      const result = await getActiveWaiver(session.organization_id)
      if (!result.success || !result.data) return
      setActiveWaiver(result.data)

      if (user) {
        // Logged-in user: check if they've already agreed to the current version
        const agreementResult = await checkWaiverAgreement(session.organization_id)
        if (agreementResult.success && agreementResult.data?.hasAgreed) {
          return // waiverNeeded stays false
        }
      }
      // Guest users always need waiver; logged-in users who haven't agreed need it
      setWaiverNeeded(true)
    }
    checkWaiver()
  }, [session.organization_id, mode, user])

  // For edit or confirmation modes, use the BookingPanel
  // This return is placed AFTER all hooks to comply with React's rules of hooks
  if ((mode === 'edit' || mode === 'confirmation') && bookingDetails && startTime) {
    return (
      <BookingPanel
        session={session}
        startTime={startTime}
        booking={{
          id: bookingDetails.id,
          number_of_spots: bookingDetails.number_of_spots,
          amount_paid: bookingDetails.amount_paid,
          notes: bookingDetails.notes,
          unit_price: bookingDetails.unit_price,
          discount_amount: bookingDetails.discount_amount,
        }}
        userDetails={userDetails}
        isGuest={isGuest}
        guestEmail={guestEmail}
        slug={slug}
        sessionId={sessionId}
        isConfirmation={mode === 'confirmation'}
        isAdmin={isAdmin}
      />
    )
  }

  // Handle proceeding from Step 1 (PreCheckoutForm) to Step 2 (Stripe Checkout)
  const handleProceedToCheckout = async (formData: CheckoutFormData) => {
    if (!startTime) {
      toast({
        title: "Error",
        description: "Please select a session time",
        variant: "destructive",
      })
      return
    }

    setCheckoutLoading(true)
    setCheckoutError(null)
    setCheckoutFormData(formData)

    try {
      const result = await createEmbeddedCheckoutSession({
        sessionTemplateId: session.id,
        startTime: startTime.toISOString(),
        numberOfSpots: formData.numberOfSpots,
        customerEmail: user ? undefined : formData.email, // Only pass for guests
        promotionCode: formData.promotionCode,
        pricingType: formData.pricingType,
        isNewMembership: formData.isNewMembership,
        membershipId: formData.membershipId, // For multi-membership support
        slug: slug,
      })

      // Handle zero-price bypass - booking created directly
      // Use hard navigation to ensure the page actually navigates (router.push can be unreliable)
      if (result.success && result.zeroPrice && result.bookingId) {
        const confirmUrl = `/${slug}/${session.id}?confirmed=true&bookingId=${result.bookingId}&start=${encodeURIComponent(startTime.toISOString())}`
        console.log('Free checkout: hard navigating to session page', { bookingId: result.bookingId, url: confirmUrl })
        window.location.href = confirmUrl
        return
      }

      if (result.success && result.clientSecret) {
        setClientSecret(result.clientSecret)
        setConnectedAccountId(result.connectedAccountId || null)
        setCheckoutStep("checkout")
      } else {
        setCheckoutError(result.error || "Failed to create checkout session")
        toast({
          title: "Error",
          description: result.error || "Failed to create checkout session",
          variant: "destructive",
        })
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create checkout session"
      setCheckoutError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Handle going back from Step 2 to Step 1
  const handleBackFromCheckout = () => {
    setCheckoutStep("form")
    setClientSecret(null)
    setConnectedAccountId(null)
    // Keep formData preserved so user doesn't lose their input
  }

  // Perform free session booking (extracted so waiver completion can call it)
  const performFreeBooking = useCallback(async (opts?: { email?: string; spots?: number }) => {
    if (!startTime) return

    const guestEmail = opts?.email ?? ''
    const spotsToBook = opts?.spots ?? numberOfSpots

    setLoading(true)
    try {
      let clerkUserId: string

      if (!user) {
        const result = await createClerkUser({
          clerk_user_id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
          email: guestEmail,
          first_name: '',
          last_name: undefined,
        })

        if (!result.success || !result.id) {
          throw new Error(`Failed to create guest user: ${result.error}`)
        }

        clerkUserId = result.id
      } else {
        const clerkUserResult = await getClerkUser(user.id)

        if (!clerkUserResult.success) {
          throw new Error(`Failed to get clerk user: ${clerkUserResult.error}`)
        }

        if (!clerkUserResult.id) {
          const result = await createClerkUser({
            email: user.emailAddresses[0].emailAddress,
            first_name: user.firstName || undefined,
            last_name: user.lastName || undefined,
          })

          if (!result.success || !result.id) {
            throw new Error(`Failed to create clerk user: ${result.error}`)
          }

          clerkUserId = result.id
        } else {
          clerkUserId = clerkUserResult.id
        }
      }

      const result = await createBooking({
        session_template_id: session.id,
        user_id: clerkUserId,
        start_time: startTime.toISOString(),
        notes: notes || undefined,
        number_of_spots: spotsToBook,
      })

      if (!result.success) {
        throw new Error(result.error || "Failed to create booking")
      }

      router.push(`/${slug}/confirmation?bookingId=${result.id}`)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to manage booking. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [startTime, user, session.id, notes, numberOfSpots, slug, router, toast])

  // Waiver interception for paid checkout flow
  const handleProceedToCheckoutWithWaiver = useCallback((formData: CheckoutFormData) => {
    if (waiverNeeded && activeWaiver) {
      if (user) {
        // The user may have just agreed to the waiver inside the auth overlay during
        // the sign-up flow. The booking-form's own waiver check runs when the user
        // first appears (before they've agreed), so waiverNeeded can be stale by the
        // time onComplete fires. Do a fresh check here before showing the overlay again.
        checkWaiverAgreement(session.organization_id).then(result => {
          if (result.success && result.data?.hasAgreed) {
            // Already agreed — proceed directly without a second waiver prompt
            handleProceedToCheckout(formData)
          } else {
            setPendingCheckoutData(formData)
            setShowWaiverOverlay(true)
          }
        })
        return
      }
      // Guest user — show waiver directly
      setPendingCheckoutData(formData)
      setShowWaiverOverlay(true)
      return
    }
    handleProceedToCheckout(formData)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiverNeeded, activeWaiver, user, session.organization_id])

  // Handle waiver overlay completion
  const handleWaiverComplete = useCallback(() => {
    setShowWaiverOverlay(false)
    setWaiverNeeded(false)

    if (pendingCheckoutData) {
      // Paid session flow - proceed to Stripe checkout
      handleProceedToCheckout(pendingCheckoutData)
      setPendingCheckoutData(null)
    } else if (pendingFreeSubmit) {
      // Free session flow - proceed to booking
      setPendingFreeSubmit(false)
      performFreeBooking({ email: pendingFreeFormData?.email, spots: pendingFreeFormData?.numberOfSpots })
      setPendingFreeFormData(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCheckoutData, pendingFreeSubmit, pendingFreeFormData, performFreeBooking])

  // Handle free session proceed from PreCheckoutForm (with waiver check)
  const handleFreeSessionProceed = useCallback((formData: CheckoutFormData) => {
    if (waiverNeeded && activeWaiver) {
      setPendingFreeFormData(formData)
      setPendingFreeSubmit(true)
      setShowWaiverOverlay(true)
      return
    }
    performFreeBooking({ email: formData.email, spots: formData.numberOfSpots })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiverNeeded, activeWaiver, performFreeBooking])

  // Determine guest email for waiver overlay
  const guestEmailForWaiver = !user ? (pendingCheckoutData?.email || pendingFreeFormData?.email) : undefined

  // Render waiver overlay if needed
  if (showWaiverOverlay && activeWaiver) {
    return (
      <WaiverAgreementOverlay
        isOpen={showWaiverOverlay}
        waiver={activeWaiver}
        onComplete={handleWaiverComplete}
        guestEmail={guestEmailForWaiver}
        organizationId={!user ? session.organization_id : undefined}
      />
    )
  }

  // When session is full (mode='new'), show waiting list instead of booking options
  if (mode === 'new' && spotsRemaining <= 0 && startTime && sessionInstanceId) {
    return (
      <WaitingListForm
        sessionInstanceId={sessionInstanceId}
        sessionTemplateId={session.id}
        organizationId={session.organization_id}
        startTime={startTime}
        sessionCapacity={session.capacity}
        userEmail={user?.primaryEmailAddress?.emailAddress}
        userFirstName={user?.firstName ?? undefined}
        isLoggedIn={!!user}
      />
    )
  }

  // For paid sessions: 2-step checkout flow
  if (isPaidSession) {
    // Step 1: Pre-checkout form
    if (checkoutStep === "form") {
      return (
        <PreCheckoutForm
          session={session}
          startTime={startTime!}
          spotsRemaining={spotsRemaining}
          userEmail={user?.primaryEmailAddress?.emailAddress}
          isLoggedIn={!!user}
          slug={slug}
          organizationId={session.organization_id}
          onProceedToCheckout={handleProceedToCheckoutWithWaiver}
          isLoading={checkoutLoading}
          memberships={memberships}
          userMembershipId={userMembershipId}
          userMembershipDisabled={userMembershipDisabled}
          userMembershipName={userMembershipName}
          memberPrice={memberPrice}
          monthlyMembershipPrice={monthlyMembershipPrice}
          isActiveMember={isActiveMember}
          defaultToMembership={defaultToMembership}
          dropInEnabled={session.drop_in_enabled !== false}
        />
      )
    }

    // Step 2: Stripe Embedded Checkout
    if (checkoutStep === "checkout" && clientSecret) {
      return (
        <CheckoutStep
          clientSecret={clientSecret}
          connectedAccountId={connectedAccountId || undefined}
          onBack={handleBackFromCheckout}
        />
      )
    }

    // Error state
    if (checkoutError) {
      return (
        <Card className="border-0 shadow-none p-0">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <p className="text-destructive">{checkoutError}</p>
              <Button variant="outline" onClick={() => setCheckoutStep("form")}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Loading state (shouldn't normally be visible, handled by PreCheckoutForm)
    if (checkoutLoading) {
      return (
        <Card className="border-0 shadow-none p-0">
          <CardContent className="p-6 flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading checkout...</p>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Fallback - shouldn't reach here
    return null
  }

  // Free sessions: use PreCheckoutForm with isFreeSession styling
  return (
    <PreCheckoutForm
      session={session}
      startTime={startTime!}
      spotsRemaining={spotsRemaining}
      userEmail={user?.primaryEmailAddress?.emailAddress}
      isLoggedIn={!!user}
      slug={slug}
      organizationId={session.organization_id}
      onProceedToCheckout={handleFreeSessionProceed}
      isLoading={loading}
      memberships={[]}
      isFreeSession={true}
    />
  )
}
