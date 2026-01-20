"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { SessionDetails } from "@/components/booking/session-details"
import { BookingForm } from "@/components/booking/booking-form"
import { SessionTemplate } from "@/types/session"
import { useUser } from "@clerk/nextjs"
import { getBookingDetails, getPublicSessionById, checkUserExistingBooking } from "@/app/actions/session"
import { useRouter } from "next/navigation"

interface SessionPageClientProps {
  sessionId: string
  searchParams: {
    start?: string
    edit?: string
    bookingId?: string
  }
}

export function SessionPageClient({ sessionId, searchParams }: SessionPageClientProps) {
  const { user } = useUser()
  const router = useRouter()
  const [session, setSession] = useState<SessionTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [bookingDetails, setBookingDetails] = useState<any>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)

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

        if (!edit && user && startParam) {
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
            router.replace(`/booking/${sessionId}?${params.toString()}`)
            return
          }
        }

        if (edit === 'true' && bookingId && user) {
          try {
            const result = await getBookingDetails(bookingId)
            if (!result.success) {
              throw new Error("Failed to fetch booking details")
            }
            const { booking, session, startTime: bookingStartTime } = (result as { success: true; data: any }).data

            // Verify that the booking belongs to the current user
            if (!booking.user || booking.user.clerk_user_id !== user.id) {
              throw new Error("You don't have permission to edit this booking")
            }

            // Set booking details and session
            setBookingDetails(booking)
            setSession(session as unknown as SessionTemplate)
            setStartTime(bookingStartTime)
            setDebugInfo({
              bookingId,
              userId: user.id
            })
          } catch (error: any) {
            setError(error.message)
            setDebugInfo((prev: any) => ({
              ...(prev || {}),
              error: error.message,
              bookingId,
              userId: user.id
            }))
          }
        } else {
          // Fetch session template using server action
          const result = await getPublicSessionById(sessionId)

          if (!result.success || !result.data) {
            throw new Error(result.error || "Session template not found")
          }

          setSession(result.data)
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
  }, [sessionId, searchParams, user, router])

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
        <div className="mb-4">
          <Link href="/booking">
            <Button variant="ghost" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Calendar
            </Button>
          </Link>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
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

  return (
    <div className="container mx-auto py-4 md:py-0">
      <div>
        <Link href="/booking">
          <Button variant="ghost" className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>

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
        />
      </div>
    </div>
  )
}
