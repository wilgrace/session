"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SessionTemplate } from "@/types/session"
import { formatPrice } from "./price-display"
import { checkEmailExists, validateCoupon } from "@/app/actions/checkout"
import { useAuthOverlay } from "@/hooks/use-auth-overlay"
import { Loader2, Check, AlertCircle, BadgeCheck, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Membership } from "@/lib/db/schema"

export interface CheckoutFormData {
  numberOfSpots: number
  email: string
  pricingType: "drop_in" | "membership"
  isNewMembership?: boolean
  membershipId?: string // The selected membership ID
  promotionCode?: string
  discountAmount?: number
}

// Membership with calculated session price
export interface MembershipPricingOption {
  membership: Membership
  sessionPrice: number // Calculated price for this session
  isUserMembership: boolean // Whether the user currently has this membership
}

interface PreCheckoutFormProps {
  session: SessionTemplate
  startTime: Date
  spotsRemaining: number
  userEmail?: string | null
  isLoggedIn: boolean
  slug: string
  organizationId: string
  onProceedToCheckout: (data: CheckoutFormData) => void
  isLoading?: boolean
  // Multi-membership props
  memberships: MembershipPricingOption[] // All available memberships with prices
  userMembershipId?: string | null // User's current membership ID
  // Backward compatibility props (deprecated)
  memberPrice?: number
  monthlyMembershipPrice?: number | null
  isActiveMember?: boolean
  // Pre-select membership option (from sign-up redirect)
  defaultToMembership?: boolean
  // Whether drop-in pricing is available for this session
  dropInEnabled?: boolean
  // User has an active membership that is not enabled for this session
  userMembershipDisabled?: boolean
  userMembershipName?: string | null
  // Free session — show a single "Free" pricing button, hide coupon/price summary
  isFreeSession?: boolean
}

interface AppliedCoupon {
  id: string
  percentOff?: number
  amountOff?: number
  name?: string
}

interface EmailValidation {
  valid: boolean
  requiresSignIn?: boolean
  error?: string
}

export function PreCheckoutForm({
  session,
  startTime,
  spotsRemaining,
  userEmail,
  isLoggedIn,
  slug,
  organizationId,
  onProceedToCheckout,
  isLoading = false,
  memberships = [],
  userMembershipId,
  // Backward compatibility
  memberPrice: legacyMemberPrice,
  monthlyMembershipPrice: legacyMonthlyMembershipPrice,
  isActiveMember: legacyIsActiveMember,
  defaultToMembership = false,
  dropInEnabled = true,
  userMembershipDisabled = false,
  userMembershipName = null,
  isFreeSession = false,
}: PreCheckoutFormProps) {
  const { openSignUp, openSignIn } = useAuthOverlay()

  // Find user's current membership
  const userMembership = memberships.find(m => m.isUserMembership)
  const isActiveMember = legacyIsActiveMember ?? !!userMembership

  // Get best member price from available memberships (for backward compat)
  const bestMemberPrice = memberships.length > 0
    ? Math.min(...memberships.map(m => m.sessionPrice))
    : (legacyMemberPrice ?? session.drop_in_price ?? 0)

  // Get monthly price for showing on new membership options
  const getMonthlyPrice = (membership: Membership) => membership.price

  // Form state - default to "membership" if user is already a member, returning from sign-up, or drop-in is disabled
  const [pricingType, setPricingType] = useState<"drop_in" | "membership">(
    isActiveMember || defaultToMembership || dropInEnabled === false ? "membership" : "drop_in"
  )
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(
    userMembershipId || (memberships.length > 0 ? memberships[0].membership.id : null)
  )
  const [numberOfSpots, setNumberOfSpots] = useState(1)
  const [email, setEmail] = useState(userEmail || "")
  const [couponCode, setCouponCode] = useState("")
  const [showCoupon, setShowCoupon] = useState(false)

  // Validation state
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [emailValidation, setEmailValidation] = useState<EmailValidation | null>(null)
  const [isValidatingEmail, setIsValidatingEmail] = useState(false)
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)

  // Saved form data for after signup completes
  const [savedFormData, setSavedFormData] = useState<CheckoutFormData | null>(null)
  // Track if we're waiting for auth overlay to complete its full flow
  const [awaitingAuthComplete, setAwaitingAuthComplete] = useState(false)

  // Get current URL for sign-in redirect
  const currentUrl = typeof window !== "undefined" ? window.location.href : ""

  // Reset to membership pricing when user becomes a member
  useEffect(() => {
    if (isActiveMember) {
      setPricingType("membership")
    }
  }, [isActiveMember])

  // When auth flow completes and we have saved form data, proceed to checkout
  // This ONLY triggers when awaitingAuthComplete becomes false (set by onComplete callback)
  useEffect(() => {
    // Don't proceed if we're still waiting for auth overlay to complete
    if (awaitingAuthComplete) return

    if (isLoggedIn && savedFormData && userEmail) {
      // User has logged in AND auth flow is complete - proceed to checkout
      onProceedToCheckout({
        ...savedFormData,
        email: userEmail,
      })
      setSavedFormData(null)
    }
  }, [isLoggedIn, savedFormData, userEmail, onProceedToCheckout, awaitingAuthComplete])

  // Get selected membership details
  const selectedMembership = memberships.find(m => m.membership.id === selectedMembershipId)
  const selectedMembershipPrice = selectedMembership?.sessionPrice ?? bestMemberPrice
  const selectedMonthlyPrice = selectedMembership ? getMonthlyPrice(selectedMembership.membership) : (legacyMonthlyMembershipPrice ?? 0)

  // Determine if this is a new membership signup
  const isNewMembership = pricingType === "membership" && !isActiveMember && selectedMonthlyPrice >= 0

  // Check if guest is trying to purchase membership (needs to create account first)
  const guestNeedsAccountForMembership = !isLoggedIn && isNewMembership

  // Calculate prices - person 1 gets member rate, additional people pay drop-in
  const dropInPrice = session.drop_in_price || 0
  const memberPrice = selectedMembershipPrice
  const person1Price = (pricingType === "membership" || isActiveMember) ? memberPrice : dropInPrice
  const additionalPersonPrice = dropInPrice // Additional people always pay drop-in
  const additionalPeople = Math.max(0, numberOfSpots - 1)

  // Calculate session subtotal
  const sessionSubtotal = person1Price + (additionalPersonPrice * additionalPeople)

  // Add membership fee for new signups
  const membershipFee = isNewMembership ? selectedMonthlyPrice : 0

  // Calculate discount (only applies to session subtotal, not membership fee)
  const calculateDiscount = useCallback(() => {
    if (!appliedCoupon) return 0
    if (appliedCoupon.percentOff) {
      return Math.round(sessionSubtotal * (appliedCoupon.percentOff / 100))
    }
    if (appliedCoupon.amountOff) {
      return Math.min(appliedCoupon.amountOff, sessionSubtotal)
    }
    return 0
  }, [appliedCoupon, sessionSubtotal])

  const discount = calculateDiscount()
  const total = sessionSubtotal - discount + membershipFee

  // Email validation
  const handleEmailBlur = async () => {
    if (!email || isLoggedIn) return

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailValidation({ valid: false, error: "Please enter a valid email address" })
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

  // Coupon validation
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return

    setIsValidatingCoupon(true)
    setCouponError(null)

    const result = await validateCoupon(couponCode, organizationId)

    setIsValidatingCoupon(false)

    if (!result.success || !result.valid) {
      setCouponError(result.error || "Invalid coupon code")
      return
    }

    if (result.coupon) {
      setAppliedCoupon({
        id: result.coupon.id,
        percentOff: result.coupon.percentOff,
        amountOff: result.coupon.amountOff,
        name: result.coupon.name,
      })
      setCouponError(null)
    }
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode("")
    setCouponError(null)
  }

  // Form submission
  const handleSubmit = () => {
    // If guest is trying to purchase membership, open signup overlay
    if (guestNeedsAccountForMembership) {
      // Save form data for after sign-up
      const formData: CheckoutFormData = {
        numberOfSpots,
        email,
        pricingType,
        isNewMembership,
        membershipId: selectedMembershipId || undefined,
        promotionCode: appliedCoupon?.id,
        discountAmount: discount,
      }
      setSavedFormData(formData)
      // Mark that we're waiting for auth flow to complete (sync + community profile)
      setAwaitingAuthComplete(true)

      // Open signup overlay - when complete, the useEffect will trigger checkout
      openSignUp({
        initialEmail: email,
        organizationId,
        onComplete: () => {
          // Auth flow complete (sync + profile done) - clear the flag to trigger useEffect
          setAwaitingAuthComplete(false)
        }
      })
      return
    }

    if (!canProceed) return

    onProceedToCheckout({
      numberOfSpots,
      email: isLoggedIn ? (userEmail || "") : email,
      pricingType,
      isNewMembership,
      membershipId: pricingType === "membership" ? (selectedMembershipId || undefined) : undefined,
      promotionCode: appliedCoupon?.id,
      discountAmount: discount,
    })
  }

  // Enforce quantity limit for new membership signups
  const effectiveSpotsRemaining = isNewMembership ? 1 : spotsRemaining

  // Determine if form is valid
  // Allow guests with membership to proceed (they'll be asked to create account)
  const canProceed =
    numberOfSpots >= 1 &&
    numberOfSpots <= effectiveSpotsRemaining &&
    (isLoggedIn || guestNeedsAccountForMembership || (email && emailValidation?.valid)) &&
    !emailValidation?.requiresSignIn &&
    !isLoading

  return (
    <div className="space-y-6">
      {/* Membership not valid for this session */}
      {userMembershipDisabled && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Membership not valid for this session</p>
          <p className="text-sm text-amber-700 mt-1">
            Your {userMembershipName ?? "membership"} is not available for this session.
          </p>
        </div>
      )}
      {/* Pricing Options */}
      <div className="space-y-3">
        {/* Free session — single always-selected option */}
        {isFreeSession ? (
          <div className="w-full flex items-start justify-between rounded-xl border-2 border-primary bg-black/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </div>
              <div>
                <div className="font-medium">Free</div>
                <div className="text-sm text-muted-foreground">There is no charge for this session</div>
              </div>
            </div>
            <div className="text-xl font-bold">£0</div>
          </div>
        ) : (
        <>
        {/* User's Current Membership - show first if they have one */}
        {userMembership && (
          <button
            type="button"
            onClick={() => {
              setPricingType("membership")
              setSelectedMembershipId(userMembership.membership.id)
            }}
            className="w-full flex items-start justify-between rounded-xl border-2 border-primary p-4 text-left transition-all bg-black/5"
          >
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground"
              >
                <Check className="h-3 w-3" />
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  {userMembership.membership.name}
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    <BadgeCheck className="h-3 w-3" />
                    Your membership
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">Member pricing</div>
              </div>
            </div>
            <div className="text-xl font-bold">{formatPrice(userMembership.sessionPrice)}</div>
          </button>
        )}

                {/* Drop-in Option - show unless user has membership or drop-in is disabled for this session */}
                {!isActiveMember && dropInEnabled !== false && (
          <button
            type="button"
            onClick={() => setPricingType("drop_in")}
            className={cn(
              "w-full flex items-start justify-between rounded-xl border-2 p-4 text-left transition-all",
              pricingType === "drop_in"
                ? "bg-black/5 border-primary"
                : "border-muted hover:border-muted-foreground/30"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  pricingType === "drop_in"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {pricingType === "drop_in" && <Check className="h-3 w-3" />}
              </div>
              <div>
                <div className="font-medium">Drop-in</div>
                <div className="text-sm text-muted-foreground">Single session access</div>
              </div>
            </div>
            <div className="text-xl font-bold">{formatPrice(dropInPrice)}</div>
          </button>
        )}

        {/* Available Memberships - show if user doesn't have a membership */}
        {!isActiveMember && memberships.length > 0 && memberships.map((option) => {
          const isSelected = pricingType === "membership" && selectedMembershipId === option.membership.id
          const monthlyPrice = option.membership.price
          const isFree = monthlyPrice === 0

          return (
            <button
              key={option.membership.id}
              type="button"
              onClick={() => {
                setPricingType("membership")
                setSelectedMembershipId(option.membership.id)
                // Memberships are individual - reset quantity to 1
                if (numberOfSpots > 1) {
                  setNumberOfSpots(1)
                }
              }}
              className={cn(
                "w-full flex items-start justify-between rounded-xl border-2 p-4 text-left transition-all",
                isSelected
                  ? "bg-black/5 border-primary"
                  : "border-muted hover:border-muted-foreground/30"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <div>
                  <div className="font-medium">{option.membership.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {option.membership.description || "Get member pricing on all sessions"}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">{formatPrice(option.sessionPrice)}</div>
                {!isFree && (
                  <div className="text-sm text-primary">
                    + {formatPrice(monthlyPrice)}/{option.membership.billingPeriod === 'yearly' ? 'yr' : 'mo'}
                  </div>
                )}
                {isFree && (
                  <div className="text-sm text-muted-foreground">Free membership</div>
                )}
              </div>
            </button>
          )
        })}
        </>
        )}
      </div>

        {/* Number of People */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Number of people</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setNumberOfSpots(Math.max(1, numberOfSpots - 1))}
                disabled={numberOfSpots <= 1 || isNewMembership}
              >
                <span className="text-lg">−</span>
              </Button>
              <span className="w-8 text-center text-xl font-bold">{numberOfSpots}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setNumberOfSpots(Math.min(effectiveSpotsRemaining, numberOfSpots + 1))}
                disabled={numberOfSpots >= effectiveSpotsRemaining || isNewMembership}
              >
                <span className="text-lg">+</span>
              </Button>
            </div>
          </div>
          {isNewMembership && !guestNeedsAccountForMembership && (
            <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
              Memberships are individual. Complete this purchase first to book for a group.
            </p>
          )}
          {!isNewMembership && isActiveMember && numberOfSpots > 1 && (
            <p className="text-sm text-muted-foreground">
              You get member rate. Additional guests pay drop-in price.
            </p>
          )}
        </div>

        {/* Email Input - only shown to guests */}
        {!isLoggedIn && (
          <div className="space-y-2">
            <Label htmlFor="email" className="text-base font-semibold">Email</Label>
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
                className={cn(
                  "h-12 rounded-xl bg-muted/50",
                  emailValidation?.requiresSignIn && "border-amber-500 focus-visible:ring-amber-500"
                )}
              />
              {isValidatingEmail && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              We&apos;ll check if you have an existing account
            </p>
            {emailValidation?.requiresSignIn && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>An account exists with this email.</span>
                <button
                  type="button"
                  onClick={() => openSignIn()}
                  className="font-medium underline whitespace-nowrap hover:opacity-80 text-primary"
                >
                  Sign in
                </button>
              </div>
            )}
            {emailValidation?.error && !emailValidation.requiresSignIn && (
              <p className="text-sm text-destructive">{emailValidation.error}</p>
            )}
          </div>
        )}

        {/* Coupon Code */}
        {!isFreeSession && <div className="space-y-2">
          <button
            type="button"
            className="flex items-center gap-1 text-base font-semibold hover:opacity-70 transition-opacity"
            onClick={() => setShowCoupon(v => !v)}
          >
            Coupon code
            <ChevronDown className={cn("h-4 w-4 transition-transform", showCoupon && "rotate-180")} />
          </button>
          {showCoupon && (
            <>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase())
                    setCouponError(null)
                  }}
                  placeholder="Enter code"
                  disabled={!!appliedCoupon}
                  className="h-12 rounded-xl bg-muted/50 flex-1"
                />
                {appliedCoupon ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveCoupon}
                    className="h-12 rounded-xl px-6"
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode.trim() || isValidatingCoupon}
                    className="h-12 rounded-xl px-6"
                  >
                    {isValidatingCoupon ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                )}
              </div>
              {couponError && (
                <p className="text-sm text-destructive">{couponError}</p>
              )}
              {appliedCoupon && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded-lg">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {appliedCoupon.name || "Coupon applied"}
                    {appliedCoupon.percentOff
                      ? `: ${appliedCoupon.percentOff}% off`
                      : appliedCoupon.amountOff
                      ? `: ${formatPrice(appliedCoupon.amountOff)} off`
                      : ""}
                  </span>
                </div>
              )}
            </>
          )}
        </div>}

        {/* Price Summary */}
        {!isFreeSession && <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          {/* Session pricing */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {pricingType === "membership" || isActiveMember ? "Session (member rate)" : "Session"}
            </span>
            <span className="font-medium">{formatPrice(person1Price)}</span>
          </div>
          {additionalPeople > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Additional guests × {additionalPeople}</span>
              <span>{formatPrice(additionalPersonPrice * additionalPeople)}</span>
            </div>
          )}
          {/* Membership fee for new signups */}
          {isNewMembership && membershipFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly membership</span>
              <span className="font-medium">{formatPrice(membershipFee)}</span>
            </div>
          )}
          {appliedCoupon && discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>−{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-3 border-t border-muted">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-xl font-bold text-primary">{formatPrice(total)}</span>
          </div>
        </div>}

        {/* Spacer so content isn't hidden behind fixed button on mobile when logged in */}
        {isLoggedIn && <div className="h-20 sm:hidden" />}

        {/* Proceed Button */}
        <div className={cn(
          isLoggedIn && "fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t sm:static sm:p-0 sm:bg-transparent sm:border-0 sm:z-auto"
        )}>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canProceed}
            className="w-full h-14 text-lg rounded-xl hover:opacity-90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading checkout...
              </>
            ) : guestNeedsAccountForMembership ? (
              "Create Account"
            ) : (
              "Continue"
            )}
          </Button>
        </div>
    </div>
  )
}
