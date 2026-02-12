"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getUserMembership,
  getUserBillingHistory,
  createBillingPortalSession,
  MembershipStatus,
  BillingHistoryItem,
} from "@/app/actions/membership"
import {
  ChevronLeft,
  Loader2,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
} from "lucide-react"
import { formatPrice } from "@/components/booking/price-display"

interface AccountPageClientProps {
  slug: string
  organizationId: string
}

export function AccountPageClient({ slug, organizationId }: AccountPageClientProps) {
  const router = useRouter()
  const { user } = useUser()
  const [membership, setMembership] = useState<MembershipStatus | null>(null)
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      const [membershipResult, billingResult] = await Promise.all([
        getUserMembership(organizationId),
        getUserBillingHistory(organizationId),
      ])

      if (membershipResult.success && membershipResult.data) {
        setMembership(membershipResult.data)
      }

      if (billingResult.success && billingResult.data) {
        setBillingHistory(billingResult.data)
      }

      setLoading(false)
    }

    loadData()
  }, [organizationId])

  const handleManageBilling = async () => {
    setPortalLoading(true)
    const result = await createBillingPortalSession(organizationId)

    if (result.success && result.data?.url) {
      window.open(result.data.url, '_blank')
    }
    setPortalLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <Button variant="ghost" className="gap-2 -ml-2" onClick={() => router.back()}>
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Membership & Billing</h1>
        <p className="text-muted-foreground">
          {user?.primaryEmailAddress?.emailAddress}
        </p>
      </div>

      {/* Membership Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Membership Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!membership?.hasMembership ? (
            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">No active membership</p>
                <p className="text-sm text-muted-foreground">
                  Become a member to get discounted rates on all sessions.
                </p>
                <Link href={`/${slug}`}>
                  <Button variant="outline" size="sm" className="mt-3">
                    View Sessions
                  </Button>
                </Link>
              </div>
            </div>
          ) : membership.isActive ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-green-800 ">
                    {membership.status === "cancelled"
                      ? `${membership.membershipName || "Membership"} (Cancelling)`
                      : membership.membershipName || "Active Membership"}
                  </p>
                  <p className="text-sm text-green-700">
                    {membership.membershipDescription || (
                      membership.membershipDiscountPercent
                        ? `${membership.membershipDiscountPercent}% off all sessions`
                        : "You get member pricing on all sessions."
                    )}
                  </p>
                </div>
              </div>

              {membership.currentPeriodEnd && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {membership.status === "cancelled" ? (
                    <span>
                      Access until{" "}
                      {new Date(membership.currentPeriodEnd).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    <span>
                      Next billing date:{" "}
                      {new Date(membership.currentPeriodEnd).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              )}

              {membership.status === "cancelled" && membership.cancelledAt && (
                <p className="text-sm text-amber-600">
                  You cancelled on{" "}
                  {new Date(membership.cancelledAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  . Your membership will remain active until the end of your billing period.
                </p>
              )}

              <Button
                onClick={handleManageBilling}
                disabled={portalLoading}
                variant="outline"
                className="w-full sm:w-auto"
              >
                {portalLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Manage Billing
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Membership Expired</p>
                <p className="text-sm text-muted-foreground">
                  Your membership has ended. Book a session and select the membership option to
                  reactivate.
                </p>
                <Link href={`/${slug}`}>
                  <Button variant="outline" size="sm" className="mt-3">
                    View Sessions
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      {billingHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Billing History
            </CardTitle>
            <CardDescription>Your recent payments and invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {billingHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium">
                      {formatPrice(item.amount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(item.created).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {item.description && ` - ${item.description}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        item.status === "paid"
                          ? "bg-green-100 text-green-800"
                          : item.status === "open"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.pdfUrl && (
                      <a
                        href={item.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
