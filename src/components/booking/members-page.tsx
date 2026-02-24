"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronLeft, AlertCircle } from "lucide-react"
import type { Membership } from "@/lib/db/schema"

interface MembersPageProps {
  memberships: Membership[]
  userHasActiveMembership: boolean
  slug: string
  organizationName: string | null
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

function getBenefitText(membership: Membership): string {
  if (membership.memberPriceType === "discount" && membership.memberDiscountPercent) {
    return `${membership.memberDiscountPercent}% off all sessions`
  }
  if (membership.memberPriceType === "fixed" && membership.memberFixedPrice !== null) {
    return `Fixed session price: ${formatPrice(membership.memberFixedPrice)}`
  }
  return ""
}

export function MembersPage({
  memberships,
  userHasActiveMembership,
  slug,
  organizationName,
}: MembersPageProps) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#F6F2EF]">
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-4 pb-12">
        {/* Header row */}
        <div className="flex items-center justify-between h-16">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 h-11 w-11"
            onClick={() => router.back()}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <span className="font-semibold text-lg">{organizationName}</span>
          <div className="w-11" />
        </div>

        <h1 className="text-3xl font-bold mt-4 mb-2">Memberships</h1>
        <p className="text-muted-foreground mb-6">
          Join as a member and get discounted access to sessions.
        </p>

        {/* Existing member banner */}
        {userHasActiveMembership && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 mb-6">
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">You already have an active membership</p>
              <p className="text-sm mt-0.5">
                Only one membership can be active at a time.{" "}
                <Link href={`/${slug}/account`} className="underline hover:no-underline">
                  Manage your membership
                </Link>{" "}
                to make changes.
              </p>
            </div>
          </div>
        )}

        {/* Membership cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {memberships.map((membership) => {
            const isFree = membership.price === 0
            const benefitText = getBenefitText(membership)

            return (
              <div
                key={membership.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm flex flex-col"
              >
                {membership.imageUrl && (
                  <div className="relative w-full h-40">
                    <Image
                      src={membership.imageUrl}
                      alt={membership.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                )}

                <div className="p-5 flex flex-col flex-1 gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{membership.name}</h2>
                    <p className="text-2xl font-bold mt-1 text-primary">
                      {isFree ? "Free" : formatPrice(membership.price)}
                      {!isFree && (
                        <span className="text-base font-normal text-muted-foreground">
                          {getBillingLabel(membership.billingPeriod)}
                        </span>
                      )}
                    </p>
                  </div>

                  {benefitText && (
                    <p className="text-sm font-medium text-foreground">{benefitText}</p>
                  )}

                  {membership.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {membership.description}
                    </p>
                  )}

                  <div className="mt-auto pt-2">
                    <Button
                      asChild
                      className="w-full hover:opacity-90"
                      variant={userHasActiveMembership ? "outline" : "default"}
                    >
                      <Link href={`/${slug}/membership/${membership.id}`}>
                        {userHasActiveMembership ? "View" : "Join"}
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
