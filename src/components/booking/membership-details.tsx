"use client"

import Image from "next/image"
import type { Membership } from "@/lib/db/schema"

interface MembershipDetailsProps {
  membership: Membership
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

export function MembershipDetails({ membership }: MembershipDetailsProps) {
  const isFree = membership.price === 0

  return (
    <div>
      {/* Membership Image */}
      {membership.imageUrl && (
        <div className="relative w-full h-48 md:h-64 rounded-lg overflow-hidden">
          <Image
            src={membership.imageUrl}
            alt={membership.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{membership.name}</h1>
          <p
            className="text-3xl font-bold mt-2"
            style={{ color: "var(--button-color, #6c47ff)" }}
          >
            {isFree ? "Free" : formatPrice(membership.price)}
            {!isFree && (
              <span className="text-lg font-normal text-muted-foreground">
                {getBillingLabel(membership.billingPeriod)}
              </span>
            )}
          </p>
        </div>

        {membership.description && (
          <p className="text-muted-foreground">{membership.description}</p>
        )}

        {/* Benefits */}
        <div className="space-y-2">
          <h3 className="font-medium">Member Benefits</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {membership.memberPriceType === "discount" &&
              membership.memberDiscountPercent && (
                <li className="flex items-start gap-2">
                  <span
                    className="mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "var(--button-color, #6c47ff)" }}
                  />
                  <span>{membership.memberDiscountPercent}% off all sessions</span>
                </li>
              )}
            {membership.memberPriceType === "fixed" &&
              membership.memberFixedPrice !== null && (
                <li className="flex items-start gap-2">
                  <span
                    className="mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "var(--button-color, #6c47ff)" }}
                  />
                  <span>Fixed session price: {formatPrice(membership.memberFixedPrice)}</span>
                </li>
              )}
            <li className="flex items-start gap-2">
              <span
                className="mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "var(--button-color, #6c47ff)" }}
              />
              <span>Priority access to sessions</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
