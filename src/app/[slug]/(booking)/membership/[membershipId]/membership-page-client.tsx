"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { MembershipDetails } from "@/components/booking/membership-details"
import { MembershipSignupForm } from "@/components/booking/membership-signup-form"
import { useUser } from "@clerk/nextjs"
import { getMembershipByIdPublic, getUserMembershipWithDetails } from "@/app/actions/memberships"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import type { Membership } from "@/lib/db/schema"

interface MembershipPageClientProps {
  membershipId: string
  searchParams: {
    confirmed?: string
    session_id?: string
  }
  slug: string
  organizationName: string | null
  organizationId: string
}

export function MembershipPageClient({
  membershipId,
  searchParams,
  slug,
  organizationName,
  organizationId,
}: MembershipPageClientProps) {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const { toast } = useToast()
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userHasActiveMembership, setUserHasActiveMembership] = useState(false)
  // Mode: 'signup' (default) or 'confirmation'
  // Persist confirmation state so it survives URL param clearing
  const isConfirmationFromUrl = searchParams.confirmed === "true"
  const [isConfirmed, setIsConfirmed] = useState(isConfirmationFromUrl)
  const [hasShownConfirmationToast, setHasShownConfirmationToast] =
    useState(false)
  const mode = isConfirmed ? "confirmation" : "signup"

  // Set confirmed state when URL param is present (handles late hydration)
  useEffect(() => {
    if (isConfirmationFromUrl) {
      setIsConfirmed(true)
    }
  }, [isConfirmationFromUrl])

  // Show confirmation toast and clean up URL
  useEffect(() => {
    if (isConfirmed && !hasShownConfirmationToast && !loading && membership) {
      toast({
        title: "Welcome to the membership!",
        description: "Your membership is now active.",
      })
      setHasShownConfirmationToast(true)

      // Clear the confirmed param from URL without reload
      router.replace(`/${slug}/membership/${membershipId}`, { scroll: false })
    }
  }, [
    isConfirmed,
    hasShownConfirmationToast,
    loading,
    membership,
    toast,
    router,
    slug,
    membershipId,
  ])

  // Fetch membership data
  useEffect(() => {
    async function fetchMembership() {
      setLoading(true)
      setError(null)

      const result = await getMembershipByIdPublic(membershipId)

      if (result.success && result.data) {
        setMembership(result.data)
      } else {
        setError(result.error || "Membership not found")
      }

      setLoading(false)
    }

    fetchMembership()
  }, [membershipId])

  // Check if user already has an active membership
  useEffect(() => {
    if (!isLoaded || !user) return

    async function checkExistingMembership() {
      const result = await getUserMembershipWithDetails(organizationId)
      if (result.success && result.data) {
        setUserHasActiveMembership(true)
      }
    }

    checkExistingMembership()
  }, [isLoaded, user, organizationId])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading membership details...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !membership) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Membership Not Found</h2>
          <p className="text-muted-foreground mb-4">
            {error || "This membership doesn't exist or is no longer available."}
          </p>
          <Link
            href={`/${slug}`}
            className="inline-flex items-center gap-1 hover:opacity-80 text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to booking
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="md:grid md:grid-cols-2 min-h-screen">
      {/* Left Column - Beige background */}
      <div className="flex justify-center">
        <div className="w-full max-w-[550px] px-4 md:px-8 pt-4 md:pt-[60px] pb-6">
          {/* Navigation header */}
          <div className="flex items-center justify-between h-20">
            <Link
              href={`/${slug}`}
              className="flex items-center gap-1 hover:opacity-80 text-primary"
            >
              <ChevronLeft className="h-5 w-5" />
              <span>Back</span>
            </Link>
            <span className="font-medium">{organizationName}</span>
            <div className="w-16" />
          </div>

          <MembershipDetails membership={membership} />
        </div>
      </div>

      {/* Right Column - White background */}
      <div className="bg-white flex justify-center">
        <div className="w-full max-w-[550px] px-4 md:px-8 pt-6 md:pt-[60px] pb-6">
          {/* Header spacing to align with left column */}
          <div className="h-20 hidden md:block" />

          {userHasActiveMembership && mode !== "confirmation" ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <p className="font-semibold text-amber-900">You already have an active membership</p>
                <p className="text-sm text-amber-800 mt-1">
                  Only one membership can be active at a time. To join a different membership, cancel your current one first.
                </p>
              </div>
              <Link
                href={`/${slug}/account`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:opacity-70 transition-opacity"
              >
                Manage your membership →
              </Link>
            </div>
          ) : (
            <MembershipSignupForm
              membership={membership}
              slug={slug}
              organizationId={organizationId}
              mode={mode}
            />
          )}
        </div>
      </div>
    </div>
  )
}
