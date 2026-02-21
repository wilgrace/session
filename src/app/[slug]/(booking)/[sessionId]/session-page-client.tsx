"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SessionDetails } from "@/components/booking/session-details"
import { BookingForm } from "@/components/booking/booking-form"
import { SessionAuthControls } from "@/components/booking/session-auth-controls"
import { SessionTemplate } from "@/types/session"
import { useUser } from "@clerk/nextjs"
import { getBookingDetails, getPublicSessionById, checkUserExistingBooking } from "@/app/actions/session"
import { getBookingMembershipPricingData, BookingMembershipPricingData } from "@/app/actions/memberships"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface SessionPageClientProps {
  sessionId: string
  searchParams: {
    start?: string
    edit?: string
    bookingId?: string
    membership?: string // Pre-select membership option (from sign-up redirect)
    confirmed?: string // Show confirmation toast
  }
  slug: string
  organizationName: string | null
  isAdmin: boolean
  // Server-prefetched initial data (eliminates client-side spinner)
  initialSession?: SessionTemplate | null
  initialBookingDetails?: any
  initialStartTimeStr?: string
}

// Calculate spots remaining for a session
function calculateSpotsRemaining(session: SessionTemplate, currentUserSpots: number = 0): number {
  const totalSpotsBooked =
    (session.instances?.reduce((total, instance) => {
      return total + (instance.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0)
    }, 0) || 0) + currentUserSpots

  return session.capacity - totalSpotsBooked
}

export function SessionPageClient({
  sessionId,
  searchParams,
  slug,
  organizationName,
  isAdmin,
  initialSession,
  initialBookingDetails,
  initialStartTimeStr,
}: SessionPageClientProps) {
  const { user } = useUser()
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<SessionTemplate | null>(initialSession ?? null)
  // Start loading=false if we have server-provided session data
  const [loading, setLoading] = useState(!initialSession)
  const [error, setError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<Date | null>(() => {
    // Prefer start time from server-side booking details
    if (initialStartTimeStr) return new Date(initialStartTimeStr)
    // Fall back to URL param
    if (searchParams.start) {
      try {
        const parsed = new Date(decodeURIComponent(searchParams.start))
        if (!isNaN(parsed.getTime())) return parsed
      } catch {}
    }
    return null
  })
  const [bookingDetails, setBookingDetails] = useState<any>(initialBookingDetails ?? null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [pricingData, setPricingData] = useState<BookingMembershipPricingData | null>(null)
  const [hasShownConfirmationToast, setHasShownConfirmationToast] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<"form" | "checkout">("form")
  // Ref to track if initial session fetch has been done (prevent refetch when user changes)
  // Pre-set to true when we have server-provided data
  const initialFetchDoneRef = useRef(!!initialSession)
  // Ref to prevent fetching pricing more than once
  const pricingFetchedRef = useRef(false)
  // Track the user ID that was used for the last booking check
  const lastBookingCheckUserIdRef = useRef<string | null>(null)

  // Determine the mode based on URL params and booking state
  const isConfirmation = searchParams.confirmed === 'true'
  const isEditMode = searchParams.edit === 'true' && searchParams.bookingId
  // Show confirmation view if:
  // 1. Edit mode with bookingId → 'edit'
  // 2. Confirmed param or existing booking details → 'confirmation' (allows guests to see their booking)
  // 3. Otherwise → 'new'
  const mode = isEditMode ? 'edit' : (bookingDetails ? 'confirmation' : 'new')

  // Show confirmation toast when arriving with confirmed=true
  useEffect(() => {
    if (isConfirmation && !hasShownConfirmationToast && !loading) {
      toast({
        title: "Booking Confirmed!",
        description: "Your booking has been successfully created.",
      })
      setHasShownConfirmationToast(true)

      // Clear the confirmed param from URL without reload
      const newUrl = `/${slug}/${sessionId}${searchParams.start ? `?start=${encodeURIComponent(searchParams.start)}` : ''}${searchParams.bookingId ? `${searchParams.start ? '&' : '?'}bookingId=${searchParams.bookingId}` : ''}`
      router.replace(newUrl, { scroll: false })
    }
  }, [isConfirmation, hasShownConfirmationToast, loading, toast, router, slug, sessionId, searchParams])

  useEffect(() => {
    const fetchSession = async () => {
      let isRedirecting = false
      try {
        // Validate sessionId
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
          setError("Invalid session ID provided")
          setLoading(false)
          return
        }

        const startParam = searchParams.start

        // Check if we're in edit mode
        const edit = searchParams.edit
        const bookingId = searchParams.bookingId

        // Only check for existing booking if:
        // 1. Not in edit mode
        // 2. User is logged in
        // 3. We have a start time
        // 4. We haven't already checked for this user (prevent duplicate checks when user reference changes)
        if (!edit && !bookingId && user && startParam && lastBookingCheckUserIdRef.current !== user.id) {
          lastBookingCheckUserIdRef.current = user.id
          // Check if user already has a booking for this session instance
          const bookingCheck = await checkUserExistingBooking(
            user.id,
            sessionId,
            decodeURIComponent(startParam)
          )

          if (bookingCheck.success && bookingCheck.booking) {
            isRedirecting = true
            // Redirect to edit mode
            const params = new URLSearchParams({
              edit: 'true',
              bookingId: bookingCheck.booking.id,
              start: decodeURIComponent(startParam)
            })
            router.replace(`/${slug}/${sessionId}?${params.toString()}`)
            return
          }
        }

        // Skip session fetch if we've already done it (server data or previous fetch)
        if (initialFetchDoneRef.current) {
          setLoading(false)
          return
        }

        // Fetch booking details if bookingId is provided
        // This handles both edit mode (logged-in users) and confirmation view (guests)
        if (bookingId) {
          console.log('Session page: fetching booking details', { bookingId, userId: user?.id })
          try {
            const result = await getBookingDetails(bookingId)
            console.log('Session page: getBookingDetails result', { success: result.success, hasData: !!(result as any).data })
            if (!result.success) {
              throw new Error("Failed to fetch booking details")
            }
            const { booking, session: bookingSession, startTime: bookingStartTime } = (result as { success: true; data: any }).data

            // For logged-in users in edit mode, verify the booking belongs to them
            // For guests, allow viewing if the booking was made by a guest account
            const isGuestBooking = booking.user?.clerk_user_id?.startsWith('guest_')
            console.log('Session page: permission check', {
              isGuestBooking,
              hasUser: !!user,
              userId: user?.id,
              bookingUserClerkId: booking.user?.clerk_user_id,
              match: booking.user?.clerk_user_id === user?.id
            })
            if (user && !isGuestBooking) {
              // Logged-in user - verify they own the booking
              if (!booking.user || booking.user.clerk_user_id !== user.id) {
                throw new Error("You don't have permission to view this booking")
              }
            }
            // For guest bookings, anyone with the bookingId link can view it
            // This is intentional - guests receive the link via email/confirmation

            // Set booking details and session
            setBookingDetails(booking)
            setSession(bookingSession as unknown as SessionTemplate)
            setStartTime(bookingStartTime)
            setDebugInfo({
              bookingId,
              userId: user?.id || 'guest'
            })
            initialFetchDoneRef.current = true
            setLoading(false)
            return // Don't fetch session separately, we got it from booking details
          } catch (error: any) {
            // If booking fetch fails, fall through to fetch session normally
            // This allows the page to still work for new bookings
            console.warn("Session page: booking fetch failed, falling through:", error.message)
          }
        }

        // No bookingId or booking fetch failed - fetch session template normally
        console.log('Session page: falling through to getPublicSessionById', { sessionId, startParam })
        // Fetch session template using server action
        // Pass startParam to fetch the specific instance with its bookings for availability calculation
        const result = await getPublicSessionById(sessionId, startParam ? decodeURIComponent(startParam) : undefined)

        if (!result.success || !result.data) {
          throw new Error(result.error || "Session template not found")
        }

        setSession(result.data)
        initialFetchDoneRef.current = true
      } catch (err: any) {
        setError(err.message)
        setDebugInfo((prev: any) => ({
          ...(prev || {}),
          error: err.message,
          sessionId,
          searchParams
        }))
      } finally {
        if (!isRedirecting) {
          setLoading(false)
        }
      }
    }

    fetchSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, searchParams.start, searchParams.edit, searchParams.bookingId, user?.id, router, slug])

  // Fetch pricing data whenever session is available (handles both server-prefetched and client-fetched sessions)
  useEffect(() => {
    if (!session || pricingFetchedRef.current) return
    if (session.pricing_type !== "paid" || !session.drop_in_price) return

    pricingFetchedRef.current = true
    getBookingMembershipPricingData({
      organizationId: session.organization_id,
      dropInPrice: session.drop_in_price,
      sessionTemplateId: sessionId,
    }).then(result => {
      if (result.success && result.data) {
        setPricingData(result.data)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionId])

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading session details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="container mx-auto py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold mb-2">Error: {error || "Session not found"}</h2>
          {debugInfo && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-red-700 mb-2">Debug Information:</h3>
              <pre className="bg-white border border-red-100 rounded p-4 text-sm overflow-auto">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Determine if user is a guest (booking exists but user is a guest account)
  const isGuest = bookingDetails?.user?.clerk_user_id?.startsWith('guest_') || false
  const guestEmail = bookingDetails?.user?.email

  // Build user details for BookingPanel
  const userDetails = user && !isGuest ? {
    name: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
    email: user.primaryEmailAddress?.emailAddress || '',
  } : bookingDetails?.user && !isGuest ? {
    name: `${bookingDetails.user.first_name || ''} ${bookingDetails.user.last_name || ''}`.trim() || 'Unknown',
    email: bookingDetails.user.email || '',
  } : null

  return (
    <>
      {/* Mobile header - always visible on mobile */}
      <div className="flex items-center justify-between px-4 py-4 md:hidden">
        <Link
          href={`/${slug}`}
          className="flex items-center justify-center h-11 w-11 -ml-2 rounded-md hover:bg-black/5"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <span className="font-medium text-sm">{organizationName}</span>
        <SessionAuthControls isAdmin={isAdmin} slug={slug} />
      </div>

      <div className="md:grid md:grid-cols-2 min-h-screen">
        {/* Left Column - Beige background (hidden on mobile when past pricing step) */}
        <div className={cn(
          "flex justify-center",
          (checkoutStep === "checkout" || mode !== "new") && "hidden md:flex"
        )}>
          <div className="w-full max-w-[550px] px-4 md:px-8 pt-4 md:pt-[60px]">
            {/* Desktop-only nav row */}
          <div className="hidden md:flex items-center justify-between h-20">
            <Link
              href={`/${slug}`}
              className="flex items-center justify-center h-11 w-11 -ml-2 rounded-md hover:bg-black/5"
            >
              <ChevronLeft className="h-6 w-6" />
            </Link>
            <span className="font-medium">{organizationName}</span>
            <div className="w-16" />
          </div>

          <SessionDetails
            session={session}
            startTime={startTime || undefined}
            currentUserSpots={bookingDetails?.number_of_spots || 0}
          />
        </div>
      </div>

      {/* Right Column - White background */}
      <div className="bg-white flex justify-center pb-[env(safe-area-inset-bottom)]">
        <div className="w-full max-w-[550px] px-4 md:px-8 pt-6 md:pt-[60px] pb-6">
          {/* Desktop-only auth row */}
          <div className="hidden md:flex justify-end h-20">
            <SessionAuthControls isAdmin={isAdmin} slug={slug} />
          </div>
          <BookingForm
            session={session}
            startTime={startTime || undefined}
            bookingDetails={bookingDetails}
            slug={slug}
            sessionId={sessionId}
            spotsRemaining={calculateSpotsRemaining(session, bookingDetails?.number_of_spots || 0)}
            memberships={pricingData?.memberships}
            userMembershipId={pricingData?.userMembershipId}
            memberPrice={pricingData?.memberPrice}
            monthlyMembershipPrice={pricingData?.monthlyMembershipPrice}
            isActiveMember={pricingData?.isActiveMember}
            defaultToMembership={searchParams.membership === "true"}
            mode={mode}
            userDetails={userDetails}
            isGuest={isGuest}
            guestEmail={guestEmail}
            onStepChange={setCheckoutStep}
          />
        </div>
      </div>
    </div>
    </>
  )
}
