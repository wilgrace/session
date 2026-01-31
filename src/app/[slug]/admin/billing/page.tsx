"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  getStripeConnectStatus,
  createStripeConnectAccount,
  createOnboardingLink,
  createDashboardLink,
  disconnectStripeAccount,
  StripeConnectStatus,
} from "@/app/actions/stripe"
import {
  getMembershipConfig,
  configureMembershipPricing,
  updateMemberPricingDefaults,
  MembershipConfig,
} from "@/app/actions/membership"
import { CheckCircle, AlertCircle, ExternalLink, Loader2, CreditCard, Unlink, Users } from "lucide-react"
import { toast } from "sonner"

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    }>
      <BillingPageContent />
    </Suspense>
  )
}

function BillingPageContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<StripeConnectStatus | null>(null)
  const [membershipConfig, setMembershipConfig] = useState<MembershipConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  // Membership form state
  const [monthlyPrice, setMonthlyPrice] = useState("")
  const [memberPriceType, setMemberPriceType] = useState<"discount" | "fixed">("discount")
  const [discountPercent, setDiscountPercent] = useState("")
  const [fixedPrice, setFixedPrice] = useState("")
  const [savingMembership, setSavingMembership] = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)

  const success = searchParams.get("success")
  const refresh = searchParams.get("refresh")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)

    const [statusResult, membershipResult] = await Promise.all([
      getStripeConnectStatus(),
      getMembershipConfig(),
    ])

    if (statusResult.success && statusResult.data) {
      setStatus(statusResult.data)
    } else {
      setError(statusResult.error || "Failed to load status")
    }

    if (membershipResult.success && membershipResult.data) {
      setMembershipConfig(membershipResult.data)
      // Initialize form state from config
      if (membershipResult.data.monthlyPrice) {
        setMonthlyPrice((membershipResult.data.monthlyPrice / 100).toString())
      }
      if (membershipResult.data.memberPriceType) {
        setMemberPriceType(membershipResult.data.memberPriceType)
      }
      if (membershipResult.data.memberDiscountPercent) {
        setDiscountPercent(membershipResult.data.memberDiscountPercent.toString())
      }
      if (membershipResult.data.memberFixedPrice) {
        setFixedPrice((membershipResult.data.memberFixedPrice / 100).toString())
      }
    }

    setLoading(false)
  }

  async function loadStatus() {
    setLoading(true)
    setError(null)
    const result = await getStripeConnectStatus()
    if (result.success && result.data) {
      setStatus(result.data)
    } else {
      setError(result.error || "Failed to load status")
    }
    setLoading(false)
  }

  async function handleSaveMembershipPrice() {
    if (!monthlyPrice || parseFloat(monthlyPrice) <= 0) {
      toast.error("Please enter a valid monthly price")
      return
    }

    setSavingMembership(true)
    const result = await configureMembershipPricing({
      monthlyPrice: parseFloat(monthlyPrice),
    })

    if (result.success) {
      toast.success("Membership pricing saved")
      await loadData() // Refresh to get new config
    } else {
      toast.error(result.error || "Failed to save membership pricing")
    }
    setSavingMembership(false)
  }

  async function handleSavePricingDefaults() {
    if (memberPriceType === "discount" && (!discountPercent || parseInt(discountPercent) <= 0)) {
      toast.error("Please enter a valid discount percentage")
      return
    }
    if (memberPriceType === "fixed" && (!fixedPrice || parseFloat(fixedPrice) <= 0)) {
      toast.error("Please enter a valid fixed price")
      return
    }

    setSavingDefaults(true)
    const result = await updateMemberPricingDefaults({
      memberPriceType,
      memberDiscountPercent: memberPriceType === "discount" ? parseInt(discountPercent) : undefined,
      memberFixedPrice: memberPriceType === "fixed" ? Math.round(parseFloat(fixedPrice) * 100) : undefined,
    })

    if (result.success) {
      toast.success("Member pricing defaults saved")
      await loadData()
    } else {
      toast.error(result.error || "Failed to save pricing defaults")
    }
    setSavingDefaults(false)
  }

  async function handleConnectStripe() {
    setActionLoading(true)
    setError(null)

    // Step 1: Create account if needed
    if (!status?.connected) {
      const createResult = await createStripeConnectAccount()
      if (!createResult.success) {
        setError(createResult.error || "Failed to create account")
        setActionLoading(false)
        return
      }
    }

    // Step 2: Create onboarding link and redirect
    const linkResult = await createOnboardingLink()
    if (linkResult.success && linkResult.data?.url) {
      window.location.href = linkResult.data.url
    } else {
      setError(linkResult.error || "Failed to create onboarding link")
      setActionLoading(false)
    }
  }

  async function handleOpenDashboard() {
    setActionLoading(true)
    setError(null)
    const result = await createDashboardLink()
    if (result.success && result.data?.url) {
      window.open(result.data.url, "_blank")
    } else {
      setError(result.error || "Failed to open dashboard")
    }
    setActionLoading(false)
  }

  async function handleDisconnect() {
    setActionLoading(true)
    setError(null)
    const result = await disconnectStripeAccount()
    if (result.success) {
      setShowDisconnectConfirm(false)
      await loadStatus()
    } else {
      setError(result.error || "Failed to disconnect account")
    }
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">

      {/* Success message from Stripe return */}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">
            Stripe setup completed successfully! Your account status will update shortly.
          </p>
        </div>
      )}

      {/* Refresh message */}
      {refresh && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-800">
            Please complete the Stripe onboarding process to accept payments.
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Stripe Connect Status Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-base font-medium text-gray-900 mb-4">
          Stripe Connect Status
        </h3>

        {!status?.connected ? (
          // Not connected state
          <div className="text-center py-6">
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <CreditCard className="h-6 w-6 text-gray-400" />
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              Connect Your Stripe Account
            </h4>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
              Connect a Stripe account to start accepting payments for your sessions.
              You&apos;ll earn money directly from bookings with automatic payouts.
            </p>
            <Button
              onClick={handleConnectStripe}
              disabled={actionLoading}
              className="gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect with Stripe
            </Button>
          </div>
        ) : !status.onboardingComplete ? (
          // Onboarding incomplete state
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Onboarding Incomplete
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  Complete your Stripe account setup to start accepting payments.
                </p>
              </div>
            </div>
            <Button
              onClick={handleConnectStripe}
              disabled={actionLoading}
              className="gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete Setup
            </Button>
          </div>
        ) : (
          // Fully connected state
          <div className="space-y-4">
            <div className="grid gap-3">
              <StatusItem
                label="Account Connected"
                status={status.connected}
              />
              <StatusItem
                label="Details Submitted"
                status={status.onboardingComplete}
              />
              <StatusItem
                label="Charges Enabled"
                status={status.chargesEnabled}
              />
              <StatusItem
                label="Payouts Enabled"
                status={status.payoutsEnabled}
              />
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleOpenDashboard}
                disabled={actionLoading}
                className="gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Open Stripe Dashboard
              </Button>

              {!showDisconnectConfirm ? (
                <Button
                  variant="ghost"
                  onClick={() => setShowDisconnectConfirm(true)}
                  disabled={actionLoading}
                  className="gap-2 text-gray-500 hover:text-red-600"
                >
                  <Unlink className="h-4 w-4" />
                  Disconnect
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Are you sure?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Yes, disconnect"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDisconnectConfirm(false)}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Membership Settings - Only show if Stripe is connected */}
      {status?.chargesEnabled && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" />
            <h3 className="text-base font-medium text-gray-900">
              Membership Settings
            </h3>
          </div>

          {/* Monthly Subscription Price */}
          <div className="space-y-3">
            <Label htmlFor="monthlyPrice" className="text-sm font-medium">
              Monthly Membership Price
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  £
                </span>
                <Input
                  id="monthlyPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={monthlyPrice}
                  onChange={(e) => setMonthlyPrice(e.target.value)}
                  className="pl-7"
                  placeholder="15.00"
                />
              </div>
              <Button
                onClick={handleSaveMembershipPrice}
                disabled={savingMembership || !monthlyPrice}
              >
                {savingMembership && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {membershipConfig?.priceId ? "Update Price" : "Create Price"}
              </Button>
            </div>
            {membershipConfig?.priceId && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Membership product configured on Stripe
              </p>
            )}
            <p className="text-sm text-gray-500">
              This creates a recurring monthly subscription product on your Stripe account.
            </p>
          </div>

          {/* Member Session Pricing Defaults */}
          <div className="border-t pt-6 space-y-4">
            <Label className="text-sm font-medium">
              Default Member Session Pricing
            </Label>
            <p className="text-sm text-gray-500">
              How should member prices be calculated for sessions?
            </p>

            <RadioGroup
              value={memberPriceType}
              onValueChange={(v) => setMemberPriceType(v as "discount" | "fixed")}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="discount" id="discount" />
                <Label htmlFor="discount" className="font-normal cursor-pointer">
                  Percentage discount off drop-in price
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="fixed" id="fixed" />
                <Label htmlFor="fixed" className="font-normal cursor-pointer">
                  Fixed price for all sessions
                </Label>
              </div>
            </RadioGroup>

            {memberPriceType === "discount" && (
              <div className="flex items-center gap-2 ml-6">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="w-24"
                  placeholder="20"
                />
                <span className="text-sm text-gray-600">% off drop-in price</span>
              </div>
            )}

            {memberPriceType === "fixed" && (
              <div className="flex items-center gap-2 ml-6">
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    £
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    className="pl-7"
                    placeholder="5.00"
                  />
                </div>
                <span className="text-sm text-gray-600">per session</span>
              </div>
            )}

            <div className="pt-2">
              <Button
                variant="outline"
                onClick={handleSavePricingDefaults}
                disabled={savingDefaults}
              >
                {savingDefaults && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Pricing Defaults
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              These defaults apply to all sessions. You can override the member price
              for individual sessions in the session editor.
            </p>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-base font-medium text-gray-900 mb-2">
          How Payments Work
        </h3>
        <p className="text-sm text-gray-500">
          Once your Stripe account is connected and verified, customers will be able to pay
          for session bookings. Payments are deposited directly to your bank account
          through Stripe, typically within 2-7 business days.
        </p>
      </div>
    </div>
  )
}

function StatusItem({ label, status }: { label: string; status: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-600">{label}</span>
      {status ? (
        <span className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Active
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-sm text-gray-400">
          <AlertCircle className="h-4 w-4" />
          Pending
        </span>
      )}
    </div>
  )
}
