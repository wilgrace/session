"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { SessionTemplate } from "@/types/session"
import { cancelBookingWithRefund } from "@/app/actions/session"
import { formatPrice } from "./price-display"
import { GuestAccountCallout } from "./guest-account-callout"
import { CalendarDays, Users, CreditCard, Mail, Copy, Check, X } from "lucide-react"
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
  isAdmin?: boolean
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
  isAdmin = false,
}: BookingPanelProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sessionUrl, setSessionUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (sessionId && startTime) {
      setSessionUrl(
        `${window.location.origin}/${slug}/${sessionId}?start=${encodeURIComponent(startTime.toISOString())}`
      )
    }
  }, [sessionId, slug, startTime])

  const canAct = isGuest || !!userDetails || isAdmin

  const handleCancel = async () => {
    setLoading(true)
    try {
      const result = await cancelBookingWithRefund(booking.id)

      if (!result.success) {
        throw new Error(result.error || "Failed to cancel booking")
      }

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

  const handleCopyLink = async () => {
    const url = sessionUrl || (typeof window !== "undefined" ? window.location.href : "")
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-semibold text-lg">Your booking</h2>
        <p className="text-xl font-bold mt-1">
          {format(startTime, "HH:mm 'on' EEEE, do MMMM")}
        </p>
      </div>

      {/* Booking details as icon rows */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4 flex-shrink-0" />
          <span>
            {session.name}
            {session.duration_minutes ? ` (${session.duration_minutes} minutes)` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 flex-shrink-0" />
          <span>
            {booking.number_of_spots} {booking.number_of_spots === 1 ? "spot" : "spots"} booked
          </span>
        </div>
        {booking.amount_paid != null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4 flex-shrink-0" />
            <span>{formatPrice(booking.amount_paid)} paid</span>
          </div>
        )}
        {isGuest && guestEmail && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 flex-shrink-0" />
            <span>{guestEmail}</span>
          </div>
        )}
      </div>

      {/* Action buttons — only for authorized viewers */}
      {canAct && (
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                disabled={loading}
              >
                <X className="h-4 w-4" />
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

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleCopyLink}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Link & Share
              </>
            )}
          </Button>
        </div>
      )}

      {/* Good to know */}
      {session.booking_instructions && (
        <div className="space-y-1">
          <h3 className="font-semibold">Good to know</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {session.booking_instructions}
          </p>
        </div>
      )}

      {/* Guest account CTA */}
      {isGuest && (
        <GuestAccountCallout email={guestEmail} organizationId={organizationId} />
      )}
    </div>
  )
}
