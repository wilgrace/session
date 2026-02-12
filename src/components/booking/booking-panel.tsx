"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { SessionTemplate } from "@/types/session"
import { cancelBookingWithRefund } from "@/app/actions/session"
import { formatPrice } from "./price-display"
import { ShareActions } from "./share-actions"
import { ImportantInfo } from "./important-info"
import { GuestAccountCallout } from "./guest-account-callout"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface BookingPanelProps {
  session: SessionTemplate
  startTime: Date
  booking: {
    id: string
    number_of_spots: number
    amount_paid?: number | null
    notes?: string | null
    unit_price?: number | null
    discount_amount?: number | null
  }
  userDetails?: {
    name: string
    email: string
  } | null
  isGuest: boolean
  guestEmail?: string
  slug: string
  sessionId?: string
  isConfirmation?: boolean
  organizationId?: string
}

export function BookingPanel({
  session,
  startTime,
  booking,
  userDetails,
  isGuest,
  guestEmail,
  slug,
  sessionId,
  isConfirmation = false,
  organizationId,
}: BookingPanelProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // Calculate the end time based on session duration
  const endTime = new Date(startTime.getTime() + (session.duration_minutes || 60) * 60 * 1000)

  // Calculate pricing breakdown for display
  const dropInPrice = session.drop_in_price || 0
  const additionalPeople = Math.max(0, booking.number_of_spots - 1)

  // Use stored unit_price if available, otherwise use drop-in price
  const unitPrice = booking.unit_price ?? dropInPrice

  // Calculate additional guests price (always drop-in rate)
  const additionalGuestsTotal = additionalPeople * dropInPrice

  // Subtotal before discount (what would have been paid without discount)
  const subtotal = unitPrice + additionalGuestsTotal

  // Original total paid
  const originalTotal = booking.amount_paid ?? 0

  // Calculate discount: use stored value, or infer from difference between subtotal and amount paid
  const discountAmount = booking.discount_amount ?? (subtotal > originalTotal ? subtotal - originalTotal : 0)

  // Build session URL for sharing (without booking-specific params)
  const sessionUrl = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${slug}/${sessionId}?start=${encodeURIComponent(startTime.toISOString())}`
    : undefined

  const handleCancel = async () => {
    setLoading(true)
    try {
      const result = await cancelBookingWithRefund(booking.id)

      if (!result.success) {
        throw new Error(result.error || "Failed to cancel booking")
      }

      // Save delete details to localStorage for toast on calendar page
      const deleteDetails = {
        type: "delete",
        sessionName: session.name,
        date: startTime.toISOString(),
        numberOfSpots: booking.number_of_spots,
        refunded: result.refunded,
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("bookingAction", JSON.stringify(deleteDetails))
      }

      router.push(`/${slug}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to cancel booking"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Share Actions */}
      <ShareActions
        sessionName={session.name}
        startTime={startTime}
        endTime={endTime}
        duration={session.duration_minutes}
        description={session.description || undefined}
        bookingUrl={sessionUrl}
      />

      {/* Important Information */}
      <ImportantInfo instructions={session.booking_instructions} />

      {/* Booking Details */}
      {isGuest ? (
        <div className="bg-muted/30 rounded-xl p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Booking Details</h4>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">Email:</span>{" "}
              <span className="font-medium">{guestEmail}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Number of people:</span>{" "}
              <span className="font-medium">{booking.number_of_spots}</span>
            </p>
          </div>
        </div>
      ) : userDetails ? (
        <div className="bg-muted/30 rounded-xl p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Booking Details</h4>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">Name:</span>{" "}
              <span className="font-medium">{userDetails.name}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Email:</span>{" "}
              <span className="font-medium">{userDetails.email}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Number of people:</span>{" "}
              <span className="font-medium">{booking.number_of_spots}</span>
            </p>
          </div>
        </div>
      ) : null}

      {/* Guest Account Callout */}
      {isGuest && (
        <GuestAccountCallout email={guestEmail} organizationId={organizationId} />
      )}

      {/* Price Summary */}
      <div className="space-y-3">
        {/* Session price (first person) */}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Session{unitPrice < dropInPrice ? " (member rate)" : ""}
          </span>
          <span className="font-medium">{formatPrice(unitPrice)}</span>
        </div>

        {/* Additional guests */}
        {additionalPeople > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Additional guests × {additionalPeople}</span>
            <span>{formatPrice(additionalGuestsTotal)}</span>
          </div>
        )}

        {/* Discount */}
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm text-primary">
            <span>Discount</span>
            <span>−{formatPrice(discountAmount)}</span>
          </div>
        )}

        {/* Total paid */}
        <div className="flex justify-between pt-3 border-t border-muted">
          <span className="text-lg font-semibold">Total paid</span>
          <span className="text-xl font-bold">{formatPrice(originalTotal)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-primary"
            disabled={loading}
          >
            Cancel Booking
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your booking will be cancelled and you will receive a full refund if a payment was made.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep booking</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>Yes, cancel booking</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
