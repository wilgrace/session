"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import type { Membership } from "@/lib/db/schema"

interface MembershipConfirmationPanelProps {
  membership: Membership
  slug: string
}

function formatPrice(priceInPence: number): string {
  if (priceInPence === 0) return "Free"
  return `£${(priceInPence / 100).toFixed(2)}`
}

function getBillingLabel(billingPeriod: string): string {
  switch (billingPeriod) {
    case "monthly":
      return "/month"
    case "yearly":
      return "/year"
    case "one_time":
      return " (one-time)"
    default:
      return "/month"
  }
}

export function MembershipConfirmationPanel({
  membership,
  slug,
}: MembershipConfirmationPanelProps) {
  const isFree = membership.price === 0

  return (
    <div className="space-y-6 text-center">
      {/* Success icon */}
      <div className="flex justify-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--button-color, #6c47ff)" }}
        >
          <Check className="h-8 w-8 text-white" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Welcome!</h2>
        <p className="text-muted-foreground mt-2">
          You&apos;re now a {membership.name} member
        </p>
      </div>

      {/* Membership details */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-3 text-left">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Membership</span>
          <span className="font-medium">{membership.name}</span>
        </div>
        {!isFree && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Billing</span>
            <span className="font-medium">
              {formatPrice(membership.price)}
              {getBillingLabel(membership.billingPeriod)}
            </span>
          </div>
        )}
        {membership.memberPriceType === "discount" &&
          membership.memberDiscountPercent && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session discount</span>
              <span className="font-medium">
                {membership.memberDiscountPercent}% off
              </span>
            </div>
          )}
        {membership.memberPriceType === "fixed" &&
          membership.memberFixedPrice !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session price</span>
              <span className="font-medium">
                {formatPrice(membership.memberFixedPrice)}
              </span>
            </div>
          )}
      </div>

      {/* CTA to book a session */}
      <Link href={`/${slug}`}>
        <Button
          className="w-full h-14 text-lg rounded-xl hover:opacity-90"
          style={{
            backgroundColor: "var(--button-color, #6c47ff)",
            color: "var(--button-text-color, #ffffff)",
          }}
        >
          Book Your First Session
        </Button>
      </Link>
    </div>
  )
}
