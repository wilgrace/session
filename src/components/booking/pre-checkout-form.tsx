"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SessionTemplate } from "@/types/session"
import { formatPrice } from "./price-display"
import { checkEmailExists, validateCoupon } from "@/app/actions/checkout"
import { Loader2, Check, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// Hardcoded membership price in pence (£5 = 500 pence)
const MEMBERSHIP_SESSION_PRICE = 500
const MEMBERSHIP_MONTHLY_PRICE = 1500 // £15/mo

export interface CheckoutFormData {
  numberOfSpots: number
  email: string
  pricingType: "drop_in" | "membership"
  promotionCode?: string
  discountAmount?: number
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
}: PreCheckoutFormProps) {
  // Form state
  const [pricingType, setPricingType] = useState<"drop_in" | "membership">("drop_in")
  const [numberOfSpots, setNumberOfSpots] = useState(1)
  const [email, setEmail] = useState(userEmail || "")
  const [couponCode, setCouponCode] = useState("")

  // Validation state
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [emailValidation, setEmailValidation] = useState<EmailValidation | null>(null)
  const [isValidatingEmail, setIsValidatingEmail] = useState(false)
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)

  // Get current URL for sign-in redirect
  const currentUrl = typeof window !== "undefined" ? window.location.href : ""

  // Calculate prices
  const unitPrice = pricingType === "membership" ? MEMBERSHIP_SESSION_PRICE : (session.drop_in_price || 0)
  const subtotal = unitPrice * numberOfSpots

  // Calculate discount
  const calculateDiscount = useCallback(() => {
    if (!appliedCoupon) return 0
    if (appliedCoupon.percentOff) {
      return Math.round(subtotal * (appliedCoupon.percentOff / 100))
    }
    if (appliedCoupon.amountOff) {
      return Math.min(appliedCoupon.amountOff, subtotal)
    }
    return 0
  }, [appliedCoupon, subtotal])

  const discount = calculateDiscount()
  const total = subtotal - discount

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
    if (!canProceed) return

    onProceedToCheckout({
      numberOfSpots,
      email: isLoggedIn ? (userEmail || "") : email,
      pricingType,
      promotionCode: appliedCoupon?.id,
      discountAmount: discount,
    })
  }

  // Determine if form is valid
  const canProceed =
    numberOfSpots >= 1 &&
    numberOfSpots <= spotsRemaining &&
    (isLoggedIn || (email && emailValidation?.valid)) &&
    !emailValidation?.requiresSignIn &&
    !isLoading

  return (
    <Card className="border-0 shadow-none md:border md:shadow">
      <CardContent className="p-6 space-y-6">
        {/* Pricing Options */}
        <div className="space-y-3">
          {/* Drop-in Option */}
          <button
            type="button"
            onClick={() => setPricingType("drop_in")}
            className={cn(
              "w-full flex items-start justify-between rounded-xl border-2 p-4 text-left transition-all",
              pricingType === "drop_in"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-muted-foreground/30"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2",
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
            <div className="text-xl font-bold">{formatPrice(session.drop_in_price || 0)}</div>
          </button>

          {/* Membership Option */}
          <button
            type="button"
            onClick={() => setPricingType("membership")}
            className={cn(
              "w-full flex items-start justify-between rounded-xl border-2 p-4 text-left transition-all",
              pricingType === "membership"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-muted-foreground/30"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2",
                  pricingType === "membership"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {pricingType === "membership" && <Check className="h-3 w-3" />}
              </div>
              <div>
                <div className="font-medium">Membership</div>
                <div className="text-sm text-muted-foreground">
                  Visit once a week and you&apos;ll save (and support us!)
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold">{formatPrice(MEMBERSHIP_SESSION_PRICE)}</div>
              <div className="text-sm text-muted-foreground">+ {formatPrice(MEMBERSHIP_MONTHLY_PRICE)}/mo</div>
            </div>
          </button>
        </div>

        {/* Number of People */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">Number of people</Label>
          <div className="flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={() => setNumberOfSpots(Math.max(1, numberOfSpots - 1))}
              disabled={numberOfSpots <= 1}
            >
              <span className="text-xl">−</span>
            </Button>
            <div className="w-32 text-center">
              <span className="text-2xl font-medium">{numberOfSpots}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={() => setNumberOfSpots(Math.min(spotsRemaining, numberOfSpots + 1))}
              disabled={numberOfSpots >= spotsRemaining}
            >
              <span className="text-xl">+</span>
            </Button>
          </div>
        </div>

        {/* Email Input */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-base font-semibold">Email</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              value={isLoggedIn ? userEmail || "" : email}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailValidation(null)
              }}
              onBlur={handleEmailBlur}
              disabled={isLoggedIn}
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
          {!isLoggedIn && (
            <p className="text-sm text-muted-foreground">
              We&apos;ll check if you have an existing account
            </p>
          )}
          {emailValidation?.requiresSignIn && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>An account exists with this email.</span>
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`}
                className="font-medium underline whitespace-nowrap"
              >
                Sign in
              </Link>
            </div>
          )}
          {emailValidation?.error && !emailValidation.requiresSignIn && (
            <p className="text-sm text-destructive">{emailValidation.error}</p>
          )}
        </div>

        {/* Coupon Code */}
        <div className="space-y-2">
          <Label htmlFor="coupon" className="text-base font-semibold">Coupon code (optional)</Label>
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
        </div>

        {/* Price Summary */}
        <div className="bg-muted/30 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price per person</span>
            <span className="font-medium">{formatPrice(unitPrice)}</span>
          </div>
          {numberOfSpots > 1 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{numberOfSpots} people</span>
              <span>{formatPrice(unitPrice)} × {numberOfSpots}</span>
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
        </div>

        {/* Proceed Button */}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canProceed}
          className="w-full h-14 text-lg rounded-xl bg-primary/80 hover:bg-primary"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading checkout...
            </>
          ) : (
            "Proceed to Checkout"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
