"use client"

import { useEffect, useState, useRef } from "react"
import { SessionDetails } from "@/components/booking/session-details"
import { BookingForm } from "@/components/booking/booking-form"
import { SessionTemplate } from "@/types/session"
import { useUser } from "@clerk/nextjs"
import { getBookingDetails, getPublicSessionById, checkUserExistingBooking } from "@/app/actions/session"
import { getBookingPricingData, BookingPricingData } from "@/app/actions/membership"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

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
}

// Calculate spots remaining for a session
function calculateSpotsRemaining(session: SessionTemplate, currentUserSpots: number = 0): number {
  const totalSpotsBooked =
    (session.instances?.reduce((total, instance) => {
      return total + (instance.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0)
    }, 0) || 0) + currentUserSpots

  return session.capacity - totalSpotsBooked
}

export function SessionPageClient({ sessionId, searchParams, slug }: SessionPageClientProps) {
  const { user } = useUser()
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<SessionTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [bookingDetails, setBookingDetails] = useState<any>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [pricingData, setPricingData] = useState<BookingPricingData | null>(null)
  const [hasShownConfirmationToast, setHasShownConfirmationToast] = useState(false)
  // Ref to track if initial session fetch has been done (prevent refetch when user changes)
  const initialFetchDoneRef = useRef(false)
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
      try {
        // Validate sessionId
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
          setError("Invalid session ID provided")
          setLoading(false)
          return
        }

        // Get start time from URL if present
        const startParam = searchParams.start
        if (startParam) {
          try {
            const parsedDate = new Date(decodeURIComponent(startParam))
            if (!isNaN(parsedDate.getTime())) {
              setStartTime(parsedDate)
            }
          } catch (err) {
            // Invalid date, ignore
          }
        }

        // Check if we're in edit mode
        const edit = searchParams.edit
        const bookingId = searchParams.bookingId

        // Only check for existing booking if:
        // 1. Not in edit mode
        // 2. User is logged in
        // 3. We have a start time
        // 4. We haven't already checked for this user (prevent duplicate checks when user reference changes)
        if (!edit && user && startParam && lastBookingCheckUserIdRef.current !== user.id) {
          lastBookingCheckUserIdRef.current = user.id
          // Check if user already has a booking for this session instance
          const bookingCheck = await checkUserExistingBooking(
            user.id,
            sessionId,
            decodeURIComponent(startParam)
          )

          if (bookingCheck.success && bookingCheck.booking) {
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

        // Skip session fetch if we've already done it (only refetch if URL params change)
        if (initialFetchDoneRef.current) {
          setLoading(false)
          return
        }

        // Fetch booking details if bookingId is provided
        // This handles both edit mode (logged-in users) and confirmation view (guests)
        if (bookingId) {
          try {
            const result = await getBookingDetails(bookingId)
            if (!result.success) {
              throw new Error("Failed to fetch booking details")
            }
            const { booking, session: bookingSession, startTime: bookingStartTime } = (result as { success: true; data: any }).data

            // For logged-in users in edit mode, verify the booking belongs to them
            // For guests, allow viewing if the booking was made by a guest account
            const isGuestBooking = booking.user?.clerk_user_id?.startsWith('guest_')
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
            console.warn("Could not fetch booking details:", error.message)
          }
        }

        // No bookingId or booking fetch failed - fetch session template normally
        // Fetch session template using server action
        // Pass startParam to fetch the specific instance with its bookings for availability calculation
        const result = await getPublicSessionById(sessionId, startParam ? decodeURIComponent(startParam) : undefined)

        if (!result.success || !result.data) {
          throw new Error(result.error || "Session template not found")
        }

        setSession(result.data)
        initialFetchDoneRef.current = true

        // Fetch pricing data for paid sessions
        if (result.data.pricing_type === "paid" && result.data.drop_in_price) {
          const pricingResult = await getBookingPricingData({
            organizationId: result.data.organization_id,
            dropInPrice: result.data.drop_in_price,
            templateMemberPrice: result.data.member_price,
          })
          if (pricingResult.success && pricingResult.data) {
            setPricingData(pricingResult.data)
          }
        }
      } catch (err: any) {
        setError(err.message)
        setDebugInfo((prev: any) => ({
          ...(prev || {}),
          error: err.message,
          sessionId,
          searchParams
        }))
      } finally {
        setLoading(false)
      }
    }

    fetchSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, searchParams.start, searchParams.edit, searchParams.bookingId, user?.id, router, slug])

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
    <div className="container mx-auto py-4 md:py-0">
      <div className="grid md:grid-cols-2 md:gap-8">
        <SessionDetails
          session={session}
          startTime={startTime || undefined}
          currentUserSpots={bookingDetails?.number_of_spots || 0}
        />
        <div className="md:hidden">
          <hr className="border-gray-200 my-0 mx-6" />
        </div>
        <BookingForm
          session={session}
          startTime={startTime || undefined}
          bookingDetails={bookingDetails}
          slug={slug}
          sessionId={sessionId}
          spotsRemaining={calculateSpotsRemaining(session, bookingDetails?.number_of_spots || 0)}
          memberPrice={pricingData?.memberPrice}
          monthlyMembershipPrice={pricingData?.monthlyMembershipPrice}
          isActiveMember={pricingData?.isActiveMember}
          defaultToMembership={searchParams.membership === "true"}
          mode={mode}
          userDetails={userDetails}
          isGuest={isGuest}
          guestEmail={guestEmail}
        />
      </div>
    </div>
  )
}
