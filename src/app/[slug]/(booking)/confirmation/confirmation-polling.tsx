"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getBookingByCheckoutSession } from "@/app/actions/checkout"
import { getBookingDetails } from "@/app/actions/session"

interface ConfirmationPollingProps {
  stripeSessionId: string
  slug: string
}

export function ConfirmationPolling({ stripeSessionId, slug }: ConfirmationPollingProps) {
  const router = useRouter()
  const [attempts, setAttempts] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const maxAttempts = 20 // 20 attempts * 1.5s = 30 seconds

  useEffect(() => {
    if (timedOut) return

    const poll = async () => {
      try {
        const lookupResult = await getBookingByCheckoutSession(stripeSessionId)

        if (lookupResult.success && lookupResult.bookingId) {
          // Booking found - get details for redirect
          const detailsResult = await getBookingDetails(lookupResult.bookingId)

          if (detailsResult.success && "data" in detailsResult && detailsResult.data) {
            const { session, startTime } = detailsResult.data
            const sessionId = session.id

            // Build redirect URL
            const redirectParams = new URLSearchParams({
              confirmed: "true",
              bookingId: lookupResult.bookingId,
            })

            if (startTime) {
              redirectParams.set("start", startTime.toISOString())
            }

            // Redirect to session page
            router.push(`/${slug}/${sessionId}?${redirectParams.toString()}`)
            return
          }
        }

        // Booking not ready yet - continue polling
        setAttempts((prev) => {
          const next = prev + 1
          if (next >= maxAttempts) {
            setTimedOut(true)
          }
          return next
        })
      } catch (error) {
        console.error("Polling error:", error)
        setAttempts((prev) => prev + 1)
      }
    }

    const timer = setTimeout(poll, 1500)
    return () => clearTimeout(timer)
  }, [attempts, timedOut, stripeSessionId, slug, router])

  if (timedOut) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto text-center space-y-6">
          <h1 className="text-2xl font-bold">Still Processing...</h1>
          <p className="text-muted-foreground">
            Your payment was successful, but we&apos;re still confirming your booking.
          </p>
          <Button onClick={() => router.refresh()}>
            Refresh Page
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto text-center space-y-6">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Processing Your Booking...</h1>
        <p className="text-muted-foreground">
          Your payment was successful! Please wait a moment while we confirm your booking.
        </p>
      </div>
    </div>
  )
}
