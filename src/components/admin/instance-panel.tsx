"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, AlertTriangle } from "lucide-react"
import { cancelSessionInstance } from "@/app/actions/session"
import { useToast } from "@/components/ui/use-toast"
import { format } from "date-fns"

interface InstancePanelSession {
  id: string
  start_time: string
  end_time?: string
  status?: string
  cancellation_reason?: string
  cancelled_at?: string
  bookings?: { id: string; status: string; number_of_spots?: number }[]
  template?: {
    id?: string
    name?: string
  }
}

interface InstancePanelProps {
  open: boolean
  session: InstancePanelSession | null
  slug: string
  onClose: () => void
  onCancelled: () => void
}

export function InstancePanel({ open, session, slug, onClose, onCancelled }: InstancePanelProps) {
  const { toast } = useToast()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState("")
  const [alertOpen, setAlertOpen] = useState(false)

  const confirmedBookings = (session?.bookings ?? []).filter(
    (b) => b.status === "confirmed" || b.status === "completed"
  )
  const confirmedSpots = confirmedBookings.reduce((sum, b) => sum + (b.number_of_spots ?? 1), 0)
  const isCancelled = session?.status === "cancelled"

  const handleCancelSession = async () => {
    if (!session) return
    setCancelling(true)
    try {
      const result = await cancelSessionInstance(session.id, reason.trim() || undefined)
      if (!result.success) {
        throw new Error(result.error || "Failed to cancel session")
      }
      toast({
        title: "Session cancelled",
        description: result.cancelledBookings > 0
          ? `${result.cancelledBookings} booking${result.cancelledBookings !== 1 ? "s" : ""} cancelled${result.refundedBookings > 0 ? `, ${result.refundedBookings} refunded` : ""}.`
          : "No bookings were affected.",
      })
      setAlertOpen(false)
      setReason("")
      onCancelled()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel session",
        variant: "destructive",
      })
    } finally {
      setCancelling(false)
    }
  }

  if (!session) return null

  const startDate = new Date(session.start_time)
  const endDate = session.end_time ? new Date(session.end_time) : null
  const templateEditHref = session.template?.id
    ? `/${slug}/admin/sessions`
    : undefined

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[400px] flex flex-col p-0">
        {/* Header */}
        <div className="px-6 py-4 border-b pr-12">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <SheetTitle className="text-base leading-tight">
                {session.template?.name ?? "Session"}
              </SheetTitle>
              {isCancelled && (
                <Badge variant="destructive" className="text-xs shrink-0">
                  Cancelled
                </Badge>
              )}
            </div>
            <SheetDescription>
              {format(startDate, "EEEE, d MMMM yyyy")}
              {" · "}
              {format(startDate, "HH:mm")}
              {endDate && ` – ${format(endDate, "HH:mm")}`}
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Cancelled state */}
          {isCancelled && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-1">
              <div className="text-sm font-medium text-destructive">This session has been cancelled</div>
              {session.cancellation_reason && (
                <div className="text-sm text-muted-foreground">{session.cancellation_reason}</div>
              )}
              {session.cancelled_at && (
                <div className="text-xs text-muted-foreground">
                  {format(new Date(session.cancelled_at), "d MMM yyyy 'at' HH:mm")}
                </div>
              )}
            </div>
          )}

          {/* Bookings summary */}
          <div className="space-y-1">
            <div className="text-sm font-medium">Bookings</div>
            {confirmedBookings.length === 0 ? (
              <div className="text-sm text-muted-foreground">No confirmed bookings</div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {confirmedBookings.length} booking{confirmedBookings.length !== 1 ? "s" : ""} · {confirmedSpots} spot{confirmedSpots !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Template link */}
          {session.template?.id && (
            <div className="text-sm text-muted-foreground">
              To add a new date for this session,{" "}
              <a
                href={templateEditHref}
                className="underline text-foreground hover:text-primary"
              >
                edit the template
              </a>
              .
            </div>
          )}

          {/* Cancel session */}
          {!isCancelled && (
            <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                  disabled={cancelling}
                >
                  Cancel this session
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      {confirmedBookings.length > 0 ? (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
                          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>
                            {confirmedBookings.length} booking{confirmedBookings.length !== 1 ? "s" : ""} will be cancelled and refunded where applicable.
                          </span>
                        </div>
                      ) : (
                        <p>This session has no confirmed bookings.</p>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="cancel-reason" className="text-sm font-medium text-foreground">
                          Reason (optional)
                        </Label>
                        <Textarea
                          id="cancel-reason"
                          placeholder="e.g. Maintenance required, instructor unavailable…"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          className="resize-none"
                        />
                        <p className="text-xs text-muted-foreground">
                          This will be included in the cancellation email sent to attendees.
                        </p>
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelling}>Keep session</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelSession}
                    disabled={cancelling}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cancelling…
                      </>
                    ) : (
                      "Yes, cancel session"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
