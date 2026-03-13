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
import type { ResolvedPriceOption } from "@/lib/pricing-utils"

export interface CheckoutFormData {
  numberOfSpots: number
  email: string
  name?: string // Guest full name (first word = first name, rest = last name)
  pricingType: "drop_in" | "membership"
  isNewMembership?: boolean
  membershipId?: string // The selected membership ID
  priceOptionId?: string // Selected price option ID
  quantity?: number // Quantity of the selected price option
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
  // Resolved price options from the price options system
  resolvedPriceOptions?: ResolvedPriceOption[]
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
  session: _session,
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
  resolvedPriceOptions = [],
}: PreCheckoutFormProps) {
  const { openSignUp, openSignIn } = useAuthOverlay()

  // Find user's current membership
  const userMembership = memberships.find(m => m.isUserMembership)
  const isActiveMember = legacyIsActiveMember ?? !!userMembership

  // Get best member price from available memberships (for backward compat)
  const bestMemberPrice = memberships.length > 0
    ? Math.min(...memberships.map(m => m.sessionPrice))
    : (legacyMemberPrice ?? 0)

  // Get monthly price for showing on new membership options
  const getMonthlyPrice = (membership: Membership) => membership.price

  // Price option state
  const hasPriceOptions = resolvedPriceOptions.length > 0
  const [selectedPriceOptionId, setSelectedPriceOptionId] = useState<string | null>(
    resolvedPriceOptions[0]?.priceOption.id ?? null
  )
  const [quantity, setQuantity] = useState(1)
  const selectedPriceOption = resolvedPriceOptions.find(o => o.priceOption.id === selectedPriceOptionId) ?? resolvedPriceOptions[0] ?? null

  // Select first price option when options load async (they arrive after component mounts)
  useEffect(() => {
    if (resolvedPriceOptions.length > 0 && selectedPriceOptionId === null) {
      setSelectedPriceOptionId(resolvedPriceOptions[0].priceOption.id)
      if (!isActiveMember) setPricingType("drop_in")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPriceOptions])

  // When there are no price options but memberships are available, default non-members
  // to the membership option so they aren't shown a ghost "Session price" fallback.
  useEffect(() => {
    if (!hasPriceOptions && !isActiveMember && memberships.filter(m => m.membership.showOnMembershipPage !== false).length > 0) {
      setPricingType("membership")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships.length, hasPriceOptions, isActiveMember])

  // Form state - default to "membership" if user is already a member (and their membership is valid for this session), returning from sign-up, or drop-in is disabled
  const [pricingType, setPricingType] = useState<"drop_in" | "membership">(
    (isActiveMember && !userMembershipDisabled) || defaultToMembership || dropInEnabled === false ? "membership" : "drop_in"
  )
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(
    userMembershipId || (memberships.length > 0 ? memberships[0].membership.id : null)
  )
  // numberOfSpots is derived from price option quantity when using price options
  const [numberOfSpots, setNumberOfSpots] = useState(1)
  const [email, setEmail] = useState(userEmail || "")
  const [name, setName] = useState("")
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

  // Reset to membership pricing when user becomes a member (unless their membership is disabled for this session)
  useEffect(() => {
    if (isActiveMember && !userMembershipDisabled) {
      setPricingType("membership")
    }
  }, [isActiveMember, userMembershipDisabled])

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

  // With price options: spots = effectiveSpaces * quantity; unit price = effectivePrice
  const effectiveSpaces = selectedPriceOption?.effectiveSpaces ?? 1
  const effectiveUnitPrice = selectedPriceOption?.effectivePrice ?? 0
  const derivedSpots = hasPriceOptions ? effectiveSpaces * quantity : numberOfSpots

  // Calculate prices
  const dropInPrice = hasPriceOptions ? effectiveUnitPrice : 0
  const memberPrice = selectedMembershipPrice
  const person1Price = (pricingType === "membership" || isActiveMember) ? memberPrice : dropInPrice
  const additionalPersonPrice = hasPriceOptions ? effectiveUnitPrice : dropInPrice
  const additionalPeople = hasPriceOptions ? Math.max(0, quantity - 1) : Math.max(0, derivedSpots - 1)

  // Calculate session subtotal
  const sessionSubtotal = hasPriceOptions && pricingType !== "membership"
    ? effectiveUnitPrice * quantity
    : person1Price + (additionalPersonPrice * additionalPeople)

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

    if (result.isMigratedUser) {
      // Imported user with no Clerk account — open sign-up directly
      openSignUp({
        initialEmail: email,
        organizationId,
        contextMessage: "Your bookings have been imported — create an account to access them.",
        onComplete: () => setEmailValidation({ valid: true }),
      })
    } else if (result.exists && !result.isGuestAccount) {
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
        name: name.trim() || undefined,
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
      numberOfSpots: derivedSpots,
      email: isLoggedIn ? (userEmail || "") : email,
      name: isLoggedIn ? undefined : (name.trim() || undefined),
      pricingType,
      isNewMembership,
      membershipId: pricingType === "membership" ? (selectedMembershipId || undefined) : undefined,
      priceOptionId: hasPriceOptions && pricingType !== "membership" ? (selectedPriceOptionId ?? undefined) : undefined,
      quantity: hasPriceOptions && pricingType !== "membership" ? quantity : undefined,
      promotionCode: appliedCoupon?.id,
      discountAmount: discount,
    })
  }

  // Enforce quantity limit for new membership signups
  const effectiveSpotsRemaining = isNewMembership ? 1 : spotsRemaining
  // Max quantity for price options (how many of this option fit in remaining spots)
  const maxQuantity = hasPriceOptions && effectiveSpaces > 0
    ? Math.floor(effectiveSpotsRemaining / effectiveSpaces)
    : effectiveSpotsRemaining

  // Determine if form is valid
  // Allow guests with membership to proceed (they'll be asked to create account)
  const canProceed =
    (hasPriceOptions ? quantity >= 1 && quantity <= maxQuantity : (numberOfSpots >= 1 && numberOfSpots <= effectiveSpotsRemaining)) &&
    (isLoggedIn || guestNeedsAccountForMembership || (email && emailValidation?.valid && name.trim().length > 0)) &&
    !emailValidation?.requiresSignIn &&
    !isLoading

  return (
    <div className="space-y-6">
      {/* Membership not valid for this session */}
      {userMembershipDisabled && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="text-amber-900">{userMembershipName ?? "membership"} isn't available for this session</p>
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
        {/* User's Current Membership - show first if they have one and it's valid for this session */}
        {userMembership && !userMembershipDisabled && (
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

                {/* Price option cards (new system) — shown if price options are available */}
                {(!isActiveMember || userMembershipDisabled) && hasPriceOptions && resolvedPriceOptions.map((opt) => {
                  const isSelected = pricingType === "drop_in" && selectedPriceOptionId === opt.priceOption.id
                  return (
                    <button
                      key={opt.priceOption.id}
                      type="button"
                      onClick={() => { setPricingType("drop_in"); setSelectedPriceOptionId(opt.priceOption.id); setQuantity(1) }}
                      className={cn(
                        "w-full flex items-start justify-between rounded-xl border-2 p-4 text-left transition-all",
                        isSelected ? "bg-black/5 border-primary" : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                        )}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <div>
                          <div className="font-medium">{opt.priceOption.name}</div>
                          {opt.priceOption.description && (
                            <div className="text-sm text-muted-foreground">{opt.priceOption.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-xl font-bold">{formatPrice(opt.effectivePrice)}</div>
                    </button>
                  )
                })}

                {/* Legacy Drop-in Option — only shown when no price options are configured.
                    Hidden for non-members when memberships are available to purchase
                    (membership-only sessions). Active members with a disabled membership
                    still see it so they have a way to book. */}
                {(!isActiveMember || userMembershipDisabled) && !hasPriceOptions && dropInEnabled !== false &&
                  (isActiveMember || memberships.filter(m => m.membership.showOnMembershipPage !== false).length === 0) && (
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
                <div className="font-medium">Session price</div>
              </div>
            </div>
            <div className="text-xl font-bold">{formatPrice(dropInPrice)}</div>
          </button>
        )}

        {/* Available Memberships - show if user doesn't have a membership and membership is publicly visible */}
        {!isActiveMember && memberships.length > 0 && memberships.filter(option => option.membership.showOnMembershipPage !== false).map((option) => {
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

        {/* Quantity / Number of Spaces picker */}
        {hasPriceOptions && pricingType === "drop_in" ? (() => {
          const isGroupTicket = effectiveSpaces > 1
          const displayValue = isGroupTicket ? effectiveSpaces : quantity
          return (
            <div className="flex items-center justify-between">
              <Label className="font-medium text-md">Number of Spaces</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={isGroupTicket || quantity <= 1}
                >
                  <span className="text-lg">−</span>
                </Button>
                <span className="w-8 text-center text-xl font-bold">{displayValue}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                  disabled={isGroupTicket || quantity >= maxQuantity}
                >
                  <span className="text-lg">+</span>
                </Button>
              </div>
            </div>
          )
        })() : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Number of spaces</Label>
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
                Memberships are individual. Checkout first to book for a group.
              </p>
            )}
          </div>
        )}

        {/* Email + Name Inputs - only shown to guests */}
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
        {!isLoggedIn && (
          <div className="space-y-2">
            <Label htmlFor="name" className="text-base font-semibold">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-12 rounded-xl bg-muted/50"
            />
          </div>
        )}

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
              <span>Additional spaces × {additionalPeople}</span>
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
          {/* Coupon code — inline within the price breakdown */}
          <div className="space-y-1.5">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowCoupon(v => !v)}
            >
              Coupon code
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showCoupon && "rotate-180")} />
            </button>
            {showCoupon && (
              <div className="space-y-1.5">
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
                    className="h-8 rounded-lg bg-background text-sm flex-1"
                  />
                  {appliedCoupon ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveCoupon}
                      className="h-8 rounded-lg px-3 text-sm"
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyCoupon}
                      disabled={!couponCode.trim() || isValidatingCoupon}
                      className="h-8 rounded-lg px-3 text-sm"
                    >
                      {isValidatingCoupon ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                    </Button>
                  )}
                </div>
                {couponError && <p className="text-xs text-destructive">{couponError}</p>}
              </div>
            )}
            {appliedCoupon && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <Check className="h-3 w-3 flex-shrink-0" />
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
          </div>
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
          isLoggedIn && "fixed bottom-0 left-0 right-0 z-50 p-4 md:bg-background border-t sm:static sm:p-0 bg-gray-50 sm:border-0 sm:z-auto"
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
