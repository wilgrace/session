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
  getPromotionCodes,
  StripeConnectStatus,
  PromotionCodeInfo,
} from "@/app/actions/stripe"
import { getMemberships } from "@/app/actions/memberships"
import type { Membership } from "@/lib/db/schema"
import { MembershipsList } from "@/components/admin/memberships-list"
import { MembershipForm } from "@/components/admin/membership-form"
import { CheckCircle, AlertCircle, ExternalLink, Loader2, CreditCard, Unlink, Users, Tag, Copy, Check } from "lucide-react"
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
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [promotionCodes, setPromotionCodes] = useState<PromotionCodeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [copiedAccountId, setCopiedAccountId] = useState(false)

  // Membership form state
  const [membershipFormOpen, setMembershipFormOpen] = useState(false)
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null)

  const success = searchParams.get("success")
  const refresh = searchParams.get("refresh")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)

    const [statusResult, membershipsResult, promoCodesResult] = await Promise.all([
      getStripeConnectStatus(),
      getMemberships(),
      getPromotionCodes(),
    ])

    if (statusResult.success && statusResult.data) {
      setStatus(statusResult.data)
    } else {
      setError(statusResult.error || "Failed to load status")
    }

    if (membershipsResult.success && membershipsResult.data) {
      setMemberships(membershipsResult.data)
    }

    if (promoCodesResult.success && promoCodesResult.data) {
      setPromotionCodes(promoCodesResult.data)
    }

    setLoading(false)
  }

  function handleEditMembership(membership: Membership) {
    setEditingMembership(membership)
    setMembershipFormOpen(true)
  }

  function handleCreateMembership() {
    setEditingMembership(null)
    setMembershipFormOpen(true)
  }

  function handleMembershipFormClose() {
    setMembershipFormOpen(false)
    setEditingMembership(null)
  }

  async function handleMembershipSuccess() {
    // Refresh memberships list
    const result = await getMemberships()
    if (result.success && result.data) {
      setMemberships(result.data)
    }
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

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success("Copied to clipboard")
    setTimeout(() => setCopiedCode(null), 2000)
  }

  function handleCopyAccountId() {
    if (status?.stripeAccountId) {
      navigator.clipboard.writeText(status.stripeAccountId)
      setCopiedAccountId(true)
      toast.success("Account ID copied")
      setTimeout(() => setCopiedAccountId(false), 2000)
    }
  }

  function formatBalance(amount: number, currency: string) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  }

  function formatDiscount(code: PromotionCodeInfo) {
    console.log("formatDiscount received:", code)
    let discount = ""
    if (code.percentOff) {
      discount = `${code.percentOff}% off`
    } else if (code.amountOff && code.currency) {
      discount = `${formatBalance(code.amountOff, code.currency)} off`
    } else {
      return "Discount"
    }

    // Append duration
    if (code.duration === "forever") {
      return `${discount} forever`
    } else if (code.duration === "repeating" && code.durationInMonths) {
      return `${discount} for ${code.durationInMonths} month${code.durationInMonths > 1 ? "s" : ""}`
    } else if (code.duration === "once") {
      return `${discount} once`
    }
    return discount
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const isFullyConnected = status?.connected && status?.onboardingComplete && status?.chargesEnabled && status?.payoutsEnabled
  const hasIssue = status?.connected && status?.onboardingComplete && (!status?.chargesEnabled || !status?.payoutsEnabled)

  return (
    <div className="flex-1 space-y-6 pt-6">

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

      {/* NOT CONNECTED: Show Stripe Connect prompt first */}
      {!status?.connected && (
        <>
          <div className="border-b border-gray-200 bg-white p-6">
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
          </div>

          {/* How Payments Work - only show when not connected */}
          <div className="border-b border-gray-200 bg-white p-6">
            <h3 className="text-base font-medium text-gray-900 mb-2">
              How Payments Work
            </h3>
            <p className="text-sm text-gray-500">
              Once your Stripe account is connected and verified, customers will be able to pay
              for session bookings. Payments are deposited directly to your bank account
              through Stripe, typically within 2-7 business days.
            </p>
          </div>
        </>
      )}

      {/* ONBOARDING INCOMPLETE */}
      {status?.connected && !status.onboardingComplete && (
        <div className="border-b border-gray-200 bg-white p-6">
          <h3 className="text-base font-medium text-gray-900 mb-4">
            Complete Stripe Setup
          </h3>
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
        </div>
      )}

      {/* CONNECTED: Show Memberships, Coupons, then Stripe at bottom */}
      {status?.chargesEnabled && (
        <>
          {/* Memberships */}
          <div className="border-b border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" />
              <h3 className="text-base font-medium text-gray-900">
                Memberships
              </h3>
            </div>

            <MembershipsList
              memberships={memberships}
              onEdit={handleEditMembership}
              onCreate={handleCreateMembership}
              onRefresh={handleMembershipSuccess}
            />
          </div>

          {/* Membership Form Sheet */}
          <MembershipForm
            open={membershipFormOpen}
            onClose={handleMembershipFormClose}
            membership={editingMembership}
            onSuccess={handleMembershipSuccess}
          />

          {/* Coupons & Promotion Codes */}
          <div className="border-b border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-gray-400" />
              <h3 className="text-base font-medium text-gray-900">
                Coupons & Promotion Codes
              </h3>
            </div>

            <p className="text-sm text-gray-500">
              Promotion codes let customers apply discounts at checkout. Create and manage them in your Stripe Dashboard.
            </p>

            {promotionCodes.length > 0 ? (
              <div className="space-y-2">
                {promotionCodes.map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <code className="px-2 py-1 rounded bg-white border border-gray-200 text-sm font-mono font-medium">
                        {code.code}
                      </code>
                      <span className="text-sm text-gray-600">
                        {formatDiscount(code)}
                      </span>
                      {code.maxRedemptions ? (
                        <span className="text-xs text-gray-400">
                          {code.timesRedeemed}/{code.maxRedemptions} used
                        </span>
                      ) : code.timesRedeemed > 0 ? (
                        <span className="text-xs text-gray-400">
                          Used {code.timesRedeemed} times
                        </span>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyCode(code.code)}
                      className="h-8 px-2"
                    >
                      {copiedCode === code.code ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-gray-500">
                No promotion codes yet. Create one in Stripe to offer discounts.
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => window.open("https://dashboard.stripe.com/coupons", "_blank")}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Manage on Stripe
            </Button>
          </div>

          {/* Stripe Section (at bottom when connected) */}
          <div className="border-b border-gray-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-gray-400" />
              <h3 className="text-base font-medium text-gray-900">Stripe</h3>
            </div>

            <p className="text-sm text-gray-500">
              Your Stripe account handles payments, payouts, and customer billing. Coupons and promotion codes are also managed directly in Stripe.
            </p>

            {/* Account Details */}
            <div className="space-y-3 pt-2">
              {/* Business Name */}
              {status.businessName && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Business Name</span>
                  <span className="text-sm font-medium text-gray-900">{status.businessName}</span>
                </div>
              )}

              {/* Account ID */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600">Account ID</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-gray-500">{status.stripeAccountId}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyAccountId}
                    className="h-6 w-6 p-0"
                  >
                    {copiedAccountId ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Balance */}
              {status.balance && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Balance</span>
                  <div className="text-sm text-right">
                    <span className="font-medium text-gray-900">
                      {formatBalance(status.balance.available, status.balance.currency)}
                    </span>
                    <span className="text-gray-400"> available</span>
                    {status.balance.pending > 0 && (
                      <>
                        <span className="text-gray-300 mx-1">/</span>
                        <span className="text-gray-500">
                          {formatBalance(status.balance.pending, status.balance.currency)}
                        </span>
                        <span className="text-gray-400"> pending</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Status - only show if there's an issue */}
              {isFullyConnected ? (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Connected
                  </span>
                </div>
              ) : hasIssue && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <p className="text-sm font-medium text-yellow-800">Account Issues</p>
                  {!status.chargesEnabled && (
                    <div className="flex items-center gap-1.5 text-sm text-yellow-600">
                      <AlertCircle className="h-4 w-4" />
                      Charges not enabled
                    </div>
                  )}
                  {!status.payoutsEnabled && (
                    <div className="flex items-center gap-1.5 text-sm text-yellow-600">
                      <AlertCircle className="h-4 w-4" />
                      Payouts not enabled
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
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
        </>
      )}
    </div>
  )
}
