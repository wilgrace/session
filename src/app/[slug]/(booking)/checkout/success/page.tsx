"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Calendar, Clock, Users, Share2, UserPlus, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { SignUp, useUser } from "@clerk/nextjs"
import { getBookingDetails } from "@/app/actions/session"

interface BookingDetails {
  id: string
  number_of_spots: number
  amount_paid: number | null
  session_instances: {
    start_time: string
    end_time: string
    session_templates: {
      id: string
      name: string
      duration_minutes: number
      booking_instructions: string | null
    }
  }
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const { user, isLoaded } = useUser()
  const [booking, setBooking] = useState<BookingDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSignUp, setShowSignUp] = useState(false)
  const [copied, setCopied] = useState(false)

  const sessionId = searchParams.get("session_id")

  useEffect(() => {
    async function fetchBooking() {
      if (!sessionId) {
        setLoading(false)
        return
      }

      try {
        // The webhook should have already confirmed the booking
        // We need to get the booking by the checkout session ID
        // For now, we'll use a small delay to allow webhook processing
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Fetch booking details - we need to add a function to get by checkout session ID
        // For now, redirect to confirmation with the booking ID from URL params
        const bookingId = searchParams.get("booking_id")
        if (bookingId) {
          const result = await getBookingDetails(bookingId)
          if (result.success && 'data' in result && result.data) {
            setBooking(result.data as unknown as BookingDetails)
          }
        }
      } catch (error) {
        console.error("Error fetching booking:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchBooking()
  }, [sessionId, searchParams])

  const handleShare = async () => {
    const shareUrl = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: booking?.session_instances?.session_templates?.name || "Sauna Booking",
          text: `Join me for a sauna session!`,
          url: shareUrl,
        })
      } catch (error) {
        // User cancelled or share failed
      }
    } else {
      // Fallback to clipboard
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Confirming your booking...</p>
        </div>
      </div>
    )
  }

  const startTime = booking?.session_instances?.start_time
    ? new Date(booking.session_instances.start_time)
    : null
  const template = booking?.session_instances?.session_templates

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Success Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Booking Confirmed!</h1>
            <p className="text-muted-foreground">
              Your payment was successful and your spot is reserved.
            </p>
          </div>
        </div>

        {/* Booking Details */}
        {booking && startTime && template && (
          <Card>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {format(startTime, "EEEE, d MMMM")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(startTime, "yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {format(startTime, "h:mm a")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {template.duration_minutes} minutes
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span>
                  {booking.number_of_spots} {booking.number_of_spots === 1 ? "spot" : "spots"} booked
                </span>
              </div>

              {booking.amount_paid && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-muted-foreground">Amount paid</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat("en-GB", {
                      style: "currency",
                      currency: "GBP",
                    }).format(booking.amount_paid / 100)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {template?.booking_instructions && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Important Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm">
                <p className="whitespace-pre-wrap">{template.booking_instructions}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleShare}
          >
            <Share2 className="mr-2 h-4 w-4" />
            {copied ? "Link Copied!" : "Share with Guests"}
          </Button>

          {/* Sign up prompt for guests */}
          {isLoaded && !user && !showSignUp && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <UserPlus className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium">Create an account</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Manage your bookings and book faster next time.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => setShowSignUp(true)}
                    >
                      Sign Up
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showSignUp && (
            <Card>
              <CardContent className="p-4">
                <SignUp
                  routing="hash"
                  afterSignUpUrl={`/${slug}`}
                />
              </CardContent>
            </Card>
          )}

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`/${slug}`)}
          >
            Back to Calendar
          </Button>
        </div>
      </div>
    </div>
  )
}
