"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { SessionTemplate } from "@/types/session"
import { cancelBookingWithRefund, getDateChangeOptions, moveBookingToInstance } from "@/app/actions/session"
import { formatPrice } from "./price-display"
import { GuestAccountCallout } from "./guest-account-callout"
import { CalendarDays, Users, CreditCard, Mail, Copy, Check, X, ChevronLeft, Loader2 } from "lucide-react"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

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

type DateOption = { id: string; start_time: string; end_time: string; available_spots: number }

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

  // Change date state
  const [changeDateOpen, setChangeDateOpen] = useState(false)
  const [dateOptionsLoading, setDateOptionsLoading] = useState(false)
  const [dateOptions, setDateOptions] = useState<DateOption[]>([])
  const [selectedOption, setSelectedOption] = useState<DateOption | null>(null)
  const [movingDate, setMovingDate] = useState(false)

  useEffect(() => {
    if (sessionId && startTime) {
      setSessionUrl(
        `${window.location.origin}/${slug}/${sessionId}?start=${encodeURIComponent(startTime.toISOString())}`
      )
    }
  }, [sessionId, slug, startTime])

  const canAct = isGuest || !!userDetails || isAdmin
  const isFuture = startTime > new Date()
  const canChangeDate = !isConfirmation && isFuture && canAct

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

  const handleOpenChangeDateSheet = async () => {
    setChangeDateOpen(true)
    setSelectedOption(null)
    setDateOptionsLoading(true)
    const result = await getDateChangeOptions(booking.id)
    setDateOptionsLoading(false)
    if (result.success && result.data) {
      setDateOptions(result.data)
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to load available dates",
        variant: "destructive",
      })
      setChangeDateOpen(false)
    }
  }

  const handleConfirmDateChange = async () => {
    if (!selectedOption) return
    setMovingDate(true)
    const result = await moveBookingToInstance(booking.id, selectedOption.id)
    if (result.success && result.newStartTime) {
      toast({
        title: "Date changed",
        description: `Moved to ${format(new Date(result.newStartTime), "EEEE, do MMMM 'at' HH:mm")}`,
      })
      setChangeDateOpen(false)
      // Navigate to the updated booking URL with the new start time
      if (sessionId) {
        router.push(
          `/${slug}/${sessionId}?edit=true&bookingId=${booking.id}&start=${encodeURIComponent(result.newStartTime)}`
        )
      } else {
        router.push(`/${slug}`)
      }
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to change date",
        variant: "destructive",
      })
      setMovingDate(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Booking details as icon rows */}
      <div className="space-y-3">

        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Your booking</h2>
          <p className="text-xl font-bold mt-1 md:hidden">
            {format(startTime, "HH:mm 'on' EEEE, do MMMM")}
          </p>
        </div>

        <div className="flex items-center gap-2 font-medium md:hidden text-muted-foreground">
          <span>
            {session.name}
            {session.duration_minutes ? ` (${session.duration_minutes} minutes)` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 font-medium">
          <Users className="h-4 w-4 flex-shrink-0" />
          <span>
            {booking.number_of_spots} {booking.number_of_spots === 1 ? "spot" : "spots"} booked
          </span>
        </div>
        {booking.amount_paid != null && (
          <div className="flex items-center gap-2 font-medium">
            <CreditCard className="h-4 w-4 flex-shrink-0" />
            <span>{formatPrice(booking.amount_paid)} paid</span>
          </div>
        )}
        {isGuest && guestEmail && (
          <div className="flex items-center gap-2 font-medium">
            <Mail className="h-4 w-4 flex-shrink-0" />
            <span>{guestEmail}</span>
          </div>
        )}
      </div>

      {/* Action buttons — only for authorized viewers */}
      {canAct && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {canChangeDate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={handleOpenChangeDateSheet}
                disabled={loading}
              >
                <CalendarDays className="h-4 w-4" />
                Change Date
              </Button>
            )}
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
                  Copy Link
                </>
              )}
            </Button>
          </div>
          {!isConfirmation && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
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
          )}
        </div>
      )}

      {/* Change Date Sheet */}
      <Sheet open={changeDateOpen} onOpenChange={(open) => {
        if (!movingDate) setChangeDateOpen(open)
      }}>
        <SheetContent side="bottom" className="max-h-[80vh] flex flex-col rounded-t-xl">
          <SheetHeader className="pb-2">
            <div className="flex items-center gap-2">
              {selectedOption && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedOption(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <SheetTitle>
                {selectedOption ? "Confirm Date Change" : "Choose a New Date"}
              </SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto py-2">
            {dateOptionsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!dateOptionsLoading && !selectedOption && (
              <>
                {dateOptions.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    No other dates available for this session.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dateOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setSelectedOption(option)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border hover:bg-accent transition-colors text-left"
                      >
                        <div>
                          <div className="font-medium">
                            {format(new Date(option.start_time), "EEEE, do MMMM")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(option.start_time), "HH:mm")}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground shrink-0">
                          {option.available_spots} spot{option.available_spots !== 1 ? "s" : ""} left
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {!dateOptionsLoading && selectedOption && (
              <div className="space-y-4 px-1">
                <p className="text-sm text-muted-foreground">
                  Move your booking to:
                </p>
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="font-semibold">
                    {format(new Date(selectedOption.start_time), "EEEE, do MMMM")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(selectedOption.start_time), "HH:mm")}
                    {session.duration_minutes ? ` · ${session.duration_minutes} minutes` : ""}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your payment details and number of spots will remain the same.
                </p>
                <Button
                  className="w-full"
                  onClick={handleConfirmDateChange}
                  disabled={movingDate}
                >
                  {movingDate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Moving...
                    </>
                  ) : (
                    "Confirm Date Change"
                  )}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Guest account CTA */}
      {isGuest && (
        <GuestAccountCallout email={guestEmail} organizationId={organizationId} />
      )}

      {/* Good to know */}
      {session.booking_instructions && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground">Good to know</h3>
          <p className="text-foreground whitespace-pre-wrap font-medium ">
            {session.booking_instructions}
          </p>
        </div>
      )}

    </div>
  )
}
