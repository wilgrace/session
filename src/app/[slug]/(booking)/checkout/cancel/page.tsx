"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter, useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { XCircle, ArrowLeft } from "lucide-react"
import { cancelPendingBooking } from "@/app/actions/checkout"

export default function CheckoutCancelPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const bookingId = searchParams.get("booking_id")

  useEffect(() => {
    // Clean up the pending booking when user cancels
    async function cleanup() {
      if (bookingId) {
        await cancelPendingBooking(bookingId)
      }
    }
    cleanup()
  }, [bookingId])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100">
            <XCircle className="h-8 w-8 text-gray-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Payment Cancelled</h1>
            <p className="text-muted-foreground mt-2">
              Your booking was not completed. No payment has been taken.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              If you experienced any issues during checkout, please try again or contact us for assistance.
            </p>

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => router.back()}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Booking
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/${slug}`)}
              >
                Back to Calendar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
