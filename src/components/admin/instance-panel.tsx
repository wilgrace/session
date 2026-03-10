"use client"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { cancelSessionInstance, deleteSessionInstance } from "@/app/actions/session"
import { getPriceOptions, getInstanceOverrides, updateInstanceCapacity, updateInstancePriceOptions, updateInstanceMembershipOverrides } from "@/app/actions/price-options"
import { getMemberships } from "@/app/actions/memberships"
import { useToast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import type { PriceOption } from "@/lib/db/schema"

interface Membership {
  id: string
  name: string
  isActive: boolean
}

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
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState("")
  const [alertOpen, setAlertOpen] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)

  // Instance overrides state
  const [overridesExpanded, setOverridesExpanded] = useState(false)
  const [loadingOverrides, setLoadingOverrides] = useState(false)
  const [savingOverrides, setSavingOverrides] = useState(false)

  // Capacity override
  const [capacityOverride, setCapacityOverride] = useState<string>("")

  // Price option overrides
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [poEnabled, setPoEnabled] = useState<Record<string, boolean>>({})
  const [poHasOverride, setPoHasOverride] = useState<Record<string, boolean>>({})
  const [poPrices, setPoPrices] = useState<Record<string, string>>({})
  const [poSpaces, setPoSpaces] = useState<Record<string, string>>({})
  const [poEditing, setPoEditing] = useState<Record<string, boolean>>({})

  // Membership overrides
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [memEnabled, setMemEnabled] = useState<Record<string, boolean>>({})
  const [memPrices, setMemPrices] = useState<Record<string, string>>({})
  const [memEditing, setMemEditing] = useState<Record<string, boolean>>({})

  const confirmedBookings = (session?.bookings ?? []).filter(
    (b) => b.status === "confirmed" || b.status === "completed"
  )
  const confirmedSpots = confirmedBookings.reduce((sum, b) => sum + (b.number_of_spots ?? 1), 0)
  const isCancelled = session?.status === "cancelled"

  // Load override data when panel opens or session changes
  useEffect(() => {
    if (!open || !session?.id) return

    async function loadOverrides() {
      setLoadingOverrides(true)
      // Reset editing state
      setPoEditing({})
      setMemEditing({})
      try {
        const [priceOptsResult, membershipsResult, overridesResult] = await Promise.all([
          getPriceOptions(),
          getMemberships(),
          getInstanceOverrides(session!.id),
        ])

        const activeOptions = priceOptsResult.success && priceOptsResult.data
          ? priceOptsResult.data.filter(o => o.isActive)
          : []
        setPriceOptions(activeOptions)

        const activeMemberships = membershipsResult.success && membershipsResult.data
          ? membershipsResult.data.filter((m: Membership) => m.isActive)
          : []
        setMemberships(activeMemberships)

        if (overridesResult.success && overridesResult.data) {
          const { capacityOverride: cap, priceOptions: poRows, membershipOverrides: memRows } = overridesResult.data

          setCapacityOverride(cap != null ? String(cap) : "")

          // Price option overrides — build maps from existing rows
          const poEnabledMap: Record<string, boolean> = {}
          const poHasOverrideMap: Record<string, boolean> = {}
          const poPriceMap: Record<string, string> = {}
          const poSpacesMap: Record<string, string> = {}
          activeOptions.forEach(o => { poEnabledMap[o.id] = true; poHasOverrideMap[o.id] = false })
          poRows.forEach(r => {
            poEnabledMap[r.priceOptionId] = r.isEnabled ?? true
            poHasOverrideMap[r.priceOptionId] = true
            if (r.overridePrice != null) poPriceMap[r.priceOptionId] = (r.overridePrice / 100).toFixed(2)
            if ((r as any).overrideSpaces != null) poSpacesMap[r.priceOptionId] = String((r as any).overrideSpaces)
          })
          setPoEnabled(poEnabledMap)
          setPoHasOverride(poHasOverrideMap)
          setPoPrices(poPriceMap)
          setPoSpaces(poSpacesMap)

          // Membership overrides — always track all memberships
          const memEnabledMap: Record<string, boolean> = {}
          const memPriceMap: Record<string, string> = {}
          activeMemberships.forEach((m: Membership) => { memEnabledMap[m.id] = true })
          memRows.forEach(r => {
            memEnabledMap[r.membershipId] = r.isEnabled ?? true
            if (r.overridePrice != null) memPriceMap[r.membershipId] = (r.overridePrice / 100).toFixed(2)
          })
          setMemEnabled(memEnabledMap)
          setMemPrices(memPriceMap)
        }
      } catch (e) {
        console.error("Failed to load instance overrides", e)
      }
      setLoadingOverrides(false)
    }

    loadOverrides()
  }, [open, session?.id])

  const handleSaveOverrides = async () => {
    if (!session?.id) return
    setSavingOverrides(true)
    try {
      // Capacity override
      const capNum = capacityOverride.trim() ? parseInt(capacityOverride) : null
      const capResult = await updateInstanceCapacity(session.id, capNum && capNum >= 1 ? capNum : null)
      if (!capResult.success) throw new Error(capResult.error || "Failed to save capacity")

      // Price option overrides — only save options that have an explicit override row
      const poInputs = priceOptions
        .filter(o => poHasOverride[o.id])
        .map(o => ({
          priceOptionId: o.id,
          isEnabled: poEnabled[o.id] ?? true,
          overridePrice: poPrices[o.id] && parseFloat(poPrices[o.id]) >= 0
            ? Math.round(parseFloat(poPrices[o.id]) * 100)
            : null,
          overrideSpaces: poSpaces[o.id] && parseInt(poSpaces[o.id]) >= 1
            ? parseInt(poSpaces[o.id])
            : null,
        }))
      const poResult = await updateInstancePriceOptions(session.id, poInputs)
      if (!poResult.success) throw new Error(poResult.error || "Failed to save ticket overrides")

      // Membership overrides — always save all so disabled state is persisted correctly
      const memInputs = memberships.map((m: Membership) => ({
        membershipId: m.id,
        isEnabled: memEnabled[m.id] ?? true,
        overridePrice: memPrices[m.id] && parseFloat(memPrices[m.id]) >= 0
          ? Math.round(parseFloat(memPrices[m.id]) * 100)
          : null,
      }))
      const memResult = await updateInstanceMembershipOverrides(session.id, memInputs)
      if (!memResult.success) throw new Error(memResult.error || "Failed to save membership overrides")

      toast({ title: "Instance overrides saved" })
      onClose()
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save overrides", variant: "destructive" })
    }
    setSavingOverrides(false)
  }

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

  const handleDeleteInstance = async () => {
    if (!session) return
    setDeleting(true)
    try {
      const result = await deleteSessionInstance(session.id)
      if (!result.success) {
        throw new Error(result.error || "Failed to delete instance")
      }
      toast({ title: "Instance deleted" })
      setDeleteAlertOpen(false)
      onCancelled()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete instance",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
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
            <>
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

              <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                    disabled={deleting}
                  >
                    Delete instance
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this cancelled instance?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>This will permanently remove it from the calendar.</p>
                        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm">
                          If this session is part of an ongoing schedule, the time slot may be recreated on the next schedule run.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Keep</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteInstance}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : "Delete instance"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
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

          {/* Instance Overrides */}
          {!isCancelled && (
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left bg-gray-50 text-sm font-medium"
                onClick={() => setOverridesExpanded(!overridesExpanded)}
              >
                <span>Instance overrides</span>
                {overridesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {overridesExpanded && (
                <div className="px-4 py-3 space-y-4 border-t">
                  {loadingOverrides ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading overrides…
                    </div>
                  ) : (
                    <>
                      {/* Capacity override */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Capacity</Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="Use template default"
                          value={capacityOverride}
                          onChange={(e) => setCapacityOverride(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <p className="text-xs text-muted-foreground">Leave blank to use the template capacity.</p>
                      </div>

                      {/* Price option overrides */}
                      {priceOptions.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ticket types</Label>
                          <div>
                            {priceOptions.map((option) => {
                              const hasOverride = poHasOverride[option.id] ?? false
                              const enabled = hasOverride ? (poEnabled[option.id] ?? true) : true
                              const priceStr = poPrices[option.id] ?? ""
                              const spacesStr = poSpaces[option.id] ?? ""
                              const isEditing = poEditing[option.id] ?? false
                              const displayPrice = priceStr ? `£${parseFloat(priceStr).toFixed(2)}` : `£${(option.price / 100).toFixed(2)}`
                              const displaySpaces = spacesStr ? parseInt(spacesStr) : option.spaces
                              return (
                                <div key={option.id} className="py-2 space-y-1.5">
                                  <div className="flex items-center gap-3">
                                    <p className="flex-1 text-sm font-medium">
                                      {option.name}
                                      {!hasOverride && <span className="text-xs text-muted-foreground font-normal ml-1">(inherited)</span>}
                                    </p>
                                    {enabled && (
                                      <button
                                        type="button"
                                        onClick={() => setPoEditing(prev => ({ ...prev, [option.id]: !prev[option.id] }))}
                                        className="text-xs text-primary underline underline-offset-2 hover:no-underline whitespace-nowrap"
                                      >
                                        {isEditing ? "Done" : "Edit"}
                                      </button>
                                    )}
                                    <Switch
                                      checked={enabled}
                                      onCheckedChange={(checked) => {
                                        setPoHasOverride(prev => ({ ...prev, [option.id]: true }))
                                        setPoEnabled(prev => ({ ...prev, [option.id]: checked }))
                                        if (!checked) setPoEditing(prev => ({ ...prev, [option.id]: false }))
                                      }}
                                      className="scale-75"
                                    />
                                  </div>
                                  {enabled && !isEditing && (
                                    <p className="text-xs text-gray-500">
                                      {displayPrice} · {displaySpaces} {displaySpaces === 1 ? "space" : "spaces"}
                                    </p>
                                  )}
                                  {enabled && isEditing && (
                                    <div className="space-y-1.5">
                                      <div className="flex gap-2">
                                        <div className="relative w-24">
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">£</span>
                                          <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder={(option.price / 100).toFixed(2)}
                                            value={priceStr}
                                            autoFocus
                                            onChange={(e) => {
                                              setPoHasOverride(prev => ({ ...prev, [option.id]: true }))
                                              setPoPrices(prev => ({ ...prev, [option.id]: e.target.value }))
                                            }}
                                            className="pl-5 h-7 text-xs"
                                          />
                                        </div>
                                        <div className="relative w-20">
                                          <Input
                                            type="number"
                                            min="1"
                                            step="1"
                                            placeholder={`${option.spaces} space${option.spaces === 1 ? "" : "s"}`}
                                            value={spacesStr}
                                            onChange={(e) => {
                                              setPoHasOverride(prev => ({ ...prev, [option.id]: true }))
                                              setPoSpaces(prev => ({ ...prev, [option.id]: e.target.value }))
                                            }}
                                            className="h-7 text-xs"
                                          />
                                        </div>
                                      </div>
                                      <p className="text-xs text-gray-400">Overrides the default for this instance only</p>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Membership overrides */}
                      {memberships.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Memberships</Label>
                          <div>
                            {memberships.map((membership) => {
                              const enabled = memEnabled[membership.id] ?? true
                              const priceStr = memPrices[membership.id] ?? ""
                              const isEditing = memEditing[membership.id] ?? false
                              return (
                                <div key={membership.id} className="py-2 space-y-1.5">
                                  <div className="flex items-center gap-3">
                                    <p className="flex-1 text-sm font-medium">{membership.name}</p>
                                    {enabled && (
                                      <button
                                        type="button"
                                        onClick={() => setMemEditing(prev => ({ ...prev, [membership.id]: !prev[membership.id] }))}
                                        className="text-xs text-primary underline underline-offset-2 hover:no-underline whitespace-nowrap"
                                      >
                                        {isEditing ? "Done" : "Edit"}
                                      </button>
                                    )}
                                    <Switch
                                      checked={enabled}
                                      onCheckedChange={(checked) => {
                                        setMemEnabled(prev => ({ ...prev, [membership.id]: checked }))
                                        if (!checked) setMemEditing(prev => ({ ...prev, [membership.id]: false }))
                                      }}
                                      className="scale-75"
                                    />
                                  </div>
                                  {enabled && !isEditing && priceStr && (
                                    <p className="text-xs text-gray-500">£{parseFloat(priceStr).toFixed(2)}</p>
                                  )}
                                  {enabled && isEditing && (
                                    <div className="space-y-1.5">
                                      <div className="relative w-28">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">£</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          placeholder="Override price"
                                          value={priceStr}
                                          autoFocus
                                          onChange={(e) => setMemPrices(prev => ({ ...prev, [membership.id]: e.target.value }))}
                                          className="pl-5 h-7 text-xs"
                                        />
                                      </div>
                                      <p className="text-xs text-gray-400">Overrides the default for this instance only</p>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <Button
                        size="sm"
                        onClick={handleSaveOverrides}
                        disabled={savingOverrides}
                        className="w-full"
                      >
                        {savingOverrides && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save overrides
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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
