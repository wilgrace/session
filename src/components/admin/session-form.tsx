"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, isValid, parseISO, startOfDay } from "date-fns"
import { CalendarIcon, Plus, X, ChevronUp, ChevronDown, Eye, EyeOff, Lock, Loader2, RefreshCw, CalendarDays, Gift, CreditCard, ExternalLink } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase"
import { useUser } from "@clerk/nextjs"
import { useAuth } from "@clerk/nextjs"
import { createClerkUser, getClerkUser } from "@/app/actions/clerk"
import { createSessionTemplate, createSessionInstance, createSessionSchedule, updateSessionTemplate, updateSessionWithSchedules, deleteSessionSchedules, deleteSessionInstances, deleteSessionTemplate, deleteSchedule } from "@/app/actions/session"
import { mapDayStringToInt, mapIntToDayString, convertDayFormat, isValidDayString } from "@/lib/day-utils"
import { formatInTimeZone } from 'date-fns-tz'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { SessionTemplate } from "@/types/session"
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/constants'
import { localToUTC, SAUNA_TIMEZONE } from '@/lib/time-utils'
import { getStripeConnectStatus } from "@/app/actions/stripe"
import { useSlug } from "@/lib/slug-context"
import Link from "next/link"
import { ImageUpload } from "@/components/admin/image-upload"
import { RichTextEditor } from "@/components/admin/rich-text-editor"
import { getMemberships, getSessionMembershipPrices, updateSessionMembershipPrices } from "@/app/actions/memberships"
import { getPriceOptions, getSessionPriceOptions, updateSessionPriceOptions } from "@/app/actions/price-options"
import type { Membership, PriceOption } from "@/lib/db/schema"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EVENT_COLORS, EventColorKey, DEFAULT_EVENT_COLOR, normalizeEventColor } from "@/lib/event-colors"

async function generateInstances() {
  try {
    const response = await fetch('/functions/v1/generate-instances', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      // Don't throw, just log the warning
      return
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    // Don't throw, just log the warning
    return
  }
}

interface SessionFormProps {
  open: boolean
  onClose: () => void
  template: SessionTemplate | null
  initialTimeSlot?: { start: Date; end: Date } | null
  defaultSessionImageUrl?: string | null
  onSuccess: () => void
}

interface ScheduleItem {
  id: string
  time: string
  days: string[]
  durationMinutes?: number | null
}

interface OneOffDateItem {
  id: string
  date: Date | undefined
  time: string
  durationMinutes: number
}

const daysOfWeek = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
]

function getDefaultMembershipPrice(membership: Membership, dropInPricePence: number): string {
  if (membership.memberPriceType === 'fixed' && membership.memberFixedPrice != null) {
    return (membership.memberFixedPrice / 100).toFixed(2)
  }
  if (membership.memberPriceType === 'discount' && membership.memberDiscountPercent != null && dropInPricePence > 0) {
    const price = Math.round(dropInPricePence * (1 - membership.memberDiscountPercent / 100))
    return (price / 100).toFixed(2)
  }
  return ''
}

export function SessionForm({ open, onClose, template, initialTimeSlot, defaultSessionImageUrl, onSuccess }: SessionFormProps) {
  const { toast } = useToast()
  const { user } = useUser()
  const { getToken } = useAuth()
  const slug = useSlug()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [visibility, setVisibility] = useState<'open' | 'hidden' | 'closed'>(template?.visibility ?? 'open')
  const [showRepeatSection, setShowRepeatSection] = useState(false)
  const [showDatesSection, setShowDatesSection] = useState(false)
  const [oneOffDates, setOneOffDates] = useState<OneOffDateItem[]>([
    { id: "1", date: undefined, time: "09:00", durationMinutes: 75 }
  ])
  const [durationMinutes, setDurationMinutes] = useState(template?.duration_minutes ?? 75)
  const [name, setName] = useState(template?.name || "")
  const [description, setDescription] = useState(template?.description || "")
  const [capacity, setCapacity] = useState(template?.capacity?.toString() || "10")
  const [schedules, setSchedules] = useState<ScheduleItem[]>(
    template?.schedules || [{ id: "1", time: "09:00", days: ["mon", "thu", "fri"] }]
  )
  const [recurrenceStartDate, setRecurrenceStartDate] = useState<Date | undefined>(undefined)
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>(undefined)
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)
  const [openOneOffDateId, setOpenOneOffDateId] = useState<string | null>(null)
  const [generalExpanded, setGeneralExpanded] = useState(!template)
  const [scheduleExpanded, setScheduleExpanded] = useState(true)
  const [paymentExpanded, setPaymentExpanded] = useState(true)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [pendingDeleteScheduleId, setPendingDeleteScheduleId] = useState<string | null>(null)
  const [pendingDeleteDateId, setPendingDeleteDateId] = useState<string | null>(null)
  const [pendingDeleteRepeat, setPendingDeleteRepeat] = useState(false)
  const [isScheduleConfirmDialogOpen, setIsScheduleConfirmDialogOpen] = useState(false)
  const [affectedBookingCount, setAffectedBookingCount] = useState(0)
  const [pendingScheduleParams, setPendingScheduleParams] = useState<Parameters<typeof updateSessionWithSchedules>[0] | null>(null)

  // Pricing state
  const [pricingType, setPricingType] = useState<'free' | 'paid'>('paid')
  const [dropInEnabled, setDropInEnabled] = useState(true)
  const [dropInPrice, setDropInPrice] = useState('')
  const [memberPrice, setMemberPrice] = useState('') // Deprecated: kept for backward compatibility
  const [bookingInstructions, setBookingInstructions] = useState('')

  // Price options state
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [priceOptionEnabled, setPriceOptionEnabled] = useState<Record<string, boolean>>({})
  const [priceOptionPrices, setPriceOptionPrices] = useState<Record<string, string>>({}) // overridePrice
  const [priceOptionSpaces, setPriceOptionSpaces] = useState<Record<string, string>>({}) // overrideSpaces
  const [priceOptionEditing, setPriceOptionEditing] = useState<Record<string, boolean>>({})
  const [loadingPriceOptions, setLoadingPriceOptions] = useState(false)

  // Membership pricing state (new multi-membership system)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [membershipEnabled, setMembershipEnabled] = useState<Record<string, boolean>>({}) // membershipId -> enabled
  const [membershipPrices, setMembershipPrices] = useState<Record<string, string>>({}) // membershipId -> price string
  const [membershipPriceEditing, setMembershipPriceEditing] = useState<Record<string, boolean>>({}) // membershipId -> price input visible
  const [loadingMemberships, setLoadingMemberships] = useState(false)

  // Image state
  const [imageUrl, setImageUrl] = useState('')

  // Event color state
  const [eventColor, setEventColor] = useState<EventColorKey>(DEFAULT_EVENT_COLOR)

  // Calendar filter state
  const [includeInFilter, setIncludeInFilter] = useState<boolean>(template?.include_in_filter ?? true)

  // Stripe Connect status
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState<boolean | null>(null)

  // Inline validation
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const clearError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  // Get the day of week in lowercase (e.g., "mon", "tue")
  const getDayOfWeek = (date: Date) => {
    return format(date, 'EEE').toLowerCase()
  }

  // Reset all state when switching to new session (template becomes null)
  useEffect(() => {
    if (!template) {
      const today = new Date()
      // General fields
      setName("")
      setDescription("")
      setCapacity("10")
      setDurationMinutes(75)
      setVisibility('open')
      setBookingInstructions("")
      setEventColor(DEFAULT_EVENT_COLOR)
      setIncludeInFilter(true)
      setGeneralExpanded(true)
      setFieldErrors({})
      // Pricing fields
      setPricingType('free')
      setDropInEnabled(true)
      setMemberPrice("")
      setDropInPrice('')
      // Image
      setImageUrl(defaultSessionImageUrl || '')
      // Schedule fields
      setRecurrenceStartDate(startOfDay(today))
      setRecurrenceEndDate(undefined)
      setShowRepeatSection(false)
      setShowDatesSection(false)
      setSchedules([{
        id: "1",
        time: "09:00",
        days: [getDayOfWeek(today)],
        durationMinutes: null
      }])
      setOneOffDates([{ id: "1", date: undefined, time: "09:00", durationMinutes: 75 }])
      // Confirmation state
      setPendingDeleteRepeat(false)
      setPendingDeleteScheduleId(null)
      setPendingDeleteDateId(null)
    }
  }, [template])

  // Update the date and time when initialTimeSlot changes
  useEffect(() => {
    if (initialTimeSlot) {
      setRecurrenceStartDate(startOfDay(initialTimeSlot.start))

      // Calculate duration in minutes
      const durationMs = initialTimeSlot.end.getTime() - initialTimeSlot.start.getTime()
      const calculatedDuration = Math.floor(durationMs / (1000 * 60))
      setDurationMinutes(calculatedDuration)

      // Set the time in the schedule and use the selected day
      const timeString = format(initialTimeSlot.start, 'HH:mm')
      setSchedules([{
        id: "1",
        time: timeString,
        days: [getDayOfWeek(initialTimeSlot.start)]
      }])

      // Keep it as recurring schedule
      setShowRepeatSection(true)
    }
  }, [initialTimeSlot])

  useEffect(() => {
    if (template) {
      setGeneralExpanded(false)

      setName(template.name)
      setDescription(template.description || "")
      setCapacity(template.capacity.toString())
      setDurationMinutes(template.duration_minutes ?? 75)
      setVisibility(template.visibility ?? 'open')

      // TODO: load pricing state from price options instead of removed template columns
      setDropInPrice('')
      setMemberPrice('')
      setBookingInstructions(template.booking_instructions || '')

      // Load image field (fall back to org default if session has no image)
      setImageUrl(template.image_url || defaultSessionImageUrl || '')

      // Load event color
      setEventColor(normalizeEventColor(template.event_color))

      // Load calendar filter setting
      setIncludeInFilter(template.include_in_filter ?? true)

      // Load recurring schedules if present
      if (template.schedules && template.schedules.length > 0) {
        setShowRepeatSection(true)
        setSchedules(template.schedules.map((s: any) => ({
          id: s.id,
          time: s.time,
          days: s.days.map((day: string) => convertDayFormat(day, false)),
          durationMinutes: s.duration_minutes
        })))
      } else {
        setShowRepeatSection(false)
      }
      if (template.recurrence_start_date) {
        const startDate = parseISO(template.recurrence_start_date)
        if (isValid(startDate)) {
          setRecurrenceStartDate(startOfDay(startDate))
        }
      }
      if (template.recurrence_end_date) {
        const endDate = parseISO(template.recurrence_end_date)
        if (isValid(endDate)) {
          setRecurrenceEndDate(startOfDay(endDate))
        }
      }

      // Load one-off dates if present
      if (template.one_off_dates && template.one_off_dates.length > 0) {
        setShowDatesSection(true)
        setOneOffDates(template.one_off_dates.map((d, i) => {
          const parsed = parseISO(d.date)
          return {
            id: String(i + 1),
            date: isValid(parsed) ? startOfDay(parsed) : undefined,
            time: d.time,
            durationMinutes: d.duration_minutes ?? (template.duration_minutes ?? 75),
          }
        }))
      } else {
        setShowDatesSection(false)
        setOneOffDates([{ id: "1", date: undefined, time: "09:00", durationMinutes: template.duration_minutes ?? 75 }])
      }
    }
  }, [template])

  // Load price options, memberships, and per-session settings when form opens
  useEffect(() => {
    async function loadPricingData() {
      if (!open) return

      setLoadingPriceOptions(true)
      setLoadingMemberships(true)
      setMembershipPriceEditing({})
      setPriceOptionEditing({})

      try {
        const [priceOptionsResult, membershipsResult] = await Promise.all([
          getPriceOptions(),
          getMemberships(),
        ])

        const activeOptions = (priceOptionsResult.success && priceOptionsResult.data)
          ? priceOptionsResult.data.filter(o => o.isActive)
          : []
        if (priceOptionsResult.success && priceOptionsResult.data) {
          setPriceOptions(priceOptionsResult.data)
        }

        const activeMemberships = (membershipsResult.success && membershipsResult.data)
          ? membershipsResult.data.filter(m => m.isActive)
          : []
        if (membershipsResult.success && membershipsResult.data) {
          setMemberships(membershipsResult.data)
        }

        if (template?.id) {
          // Load existing per-session price option settings
          const [sessionPriceOptsResult, membershipPricesResult] = await Promise.all([
            getSessionPriceOptions(template.id),
            getSessionMembershipPrices(template.id),
          ])

          // Price options
          if (sessionPriceOptsResult.success && sessionPriceOptsResult.data) {
            const rows = sessionPriceOptsResult.data
            const hasRows = rows.length > 0
            const enabledMap: Record<string, boolean> = {}
            const priceMap: Record<string, string> = {}
            const spacesMap: Record<string, string> = {}

            activeOptions.forEach((o) => {
              enabledMap[o.id] = hasRows ? false : true // if rows exist, default disabled unless row says enabled
            })

            rows.forEach((r) => {
              enabledMap[r.priceOptionId] = r.isEnabled
              if (r.overridePrice != null) priceMap[r.priceOptionId] = (r.overridePrice / 100).toFixed(2)
              if (r.overrideSpaces != null) spacesMap[r.priceOptionId] = String(r.overrideSpaces)
            })

            setPriceOptionEnabled(enabledMap)
            setPriceOptionPrices(priceMap)
            setPriceOptionSpaces(spacesMap)
          } else {
            // No session rows — all active options enabled by default
            const enabledMap: Record<string, boolean> = {}
            activeOptions.forEach((o) => { enabledMap[o.id] = true })
            setPriceOptionEnabled(enabledMap)
            setPriceOptionPrices({})
            setPriceOptionSpaces({})
          }

          // Memberships
          if (membershipPricesResult.success && membershipPricesResult.data) {
            const hasPerSessionRows = membershipPricesResult.data.length > 0
            const enabledMap: Record<string, boolean> = {}
            const priceMap: Record<string, string> = {}
            activeMemberships.forEach((m) => { enabledMap[m.id] = true })
            if (hasPerSessionRows) {
              membershipPricesResult.data.forEach((p) => {
                enabledMap[p.membershipId] = p.isEnabled
                if (p.overridePrice != null) priceMap[p.membershipId] = (p.overridePrice / 100).toFixed(2)
              })
            }
            setMembershipEnabled(enabledMap)
            setMembershipPrices(priceMap)
          }
        } else {
          // New session: all enabled, no overrides
          const optEnabledMap: Record<string, boolean> = {}
          activeOptions.forEach((o) => { optEnabledMap[o.id] = true })
          setPriceOptionEnabled(optEnabledMap)
          setPriceOptionPrices({})
          setPriceOptionSpaces({})

          const memEnabledMap: Record<string, boolean> = {}
          activeMemberships.forEach((m) => { memEnabledMap[m.id] = true })
          setMembershipEnabled(memEnabledMap)
          setMembershipPrices({})
        }
      } catch (error) {
        console.error("Error loading pricing data:", error)
      }

      setLoadingPriceOptions(false)
      setLoadingMemberships(false)
    }

    loadPricingData()
  }, [open, template?.id])

  // Check Stripe Connect status when form opens
  useEffect(() => {
    if (!open) return
    setStripeChargesEnabled(null)
    getStripeConnectStatus().then(result => {
      const enabled = !!(result.success && result.data?.chargesEnabled)
      setStripeChargesEnabled(enabled)
      if (!template) {
        setPricingType(enabled ? 'paid' : 'free')
      }
    }).catch(() => {
      setStripeChargesEnabled(true) // fail open on error
    })
  }, [open])


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Inline validation
    const errors: Record<string, string> = {}
    if (!name.trim()) errors.name = "Session name is required"
    if (!capacity || parseInt(capacity) < 1) errors.capacity = "Capacity is required"
    if (!showRepeatSection && !showDatesSection) {
      errors.schedule = "Add at least one recurring schedule or one-off date"
    }
    if (showDatesSection) {
      oneOffDates.filter(d => d.date || oneOffDates.length > 1).forEach((item) => {
        if (!item.date) errors[`one-off-date-${item.id}`] = "Date is required"
        if (!item.durationMinutes || item.durationMinutes <= 0) errors[`one-off-duration-${item.id}`] = "Duration is required"
      })
    }
    if (showRepeatSection && (!durationMinutes || durationMinutes <= 0)) errors.duration = "Duration is required"
    if (pricingType === "paid") {
      if (stripeChargesEnabled === false) {
        errors.pricingType = "Connect Stripe to accept payments for this session"
      } else {
        const activePriceOptionIds = priceOptions.filter(o => o.isActive).map(o => o.id)
        const activeMemIds = memberships.filter(m => m.isActive).map(m => m.id)
        const anyPriceEnabled = activePriceOptionIds.some(id => priceOptionEnabled[id])
        const anyMembershipEnabled = activeMemIds.some(id => membershipEnabled[id])
        if (activePriceOptionIds.length === 0 && activeMemIds.length === 0) {
          errors.pricingOptions = "Add ticket types in Billing to accept payments"
        } else if (!anyPriceEnabled && !anyMembershipEnabled) {
          errors.pricingOptions = "At least one ticket type or membership must be enabled"
        }
      }
    }
    if (showRepeatSection) {
      schedules.forEach((schedule) => {
        if (!schedule.days || schedule.days.length === 0) {
          errors[`schedule-days-${schedule.id}`] = "Select at least one day"
        }
      })
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      // Auto-expand sections containing errors
      if (errors.name || errors.capacity) setGeneralExpanded(true)
      if (Object.keys(errors).some(k => k.startsWith("one-off-") || k.startsWith("schedule-days-") || k === "duration" || k === "schedule")) setScheduleExpanded(true)
      if (errors.pricingOptions || errors.pricingType) setPaymentExpanded(true)
      // Scroll to first error after a tick (to allow sections to expand)
      setTimeout(() => {
        const firstKey = Object.keys(errors)[0]
        document.getElementById(firstKey)?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 50)
      return
    }
    setFieldErrors({})

    setLoading(true);

    try {
      if (!user) {
        throw new Error("You must be logged in to create a session");
      }

      let templateId: string;

      const oneOffDatesParam = showDatesSection
        ? oneOffDates.filter(d => d.date).map(d => ({
            date: format(d.date!, 'yyyy-MM-dd'),
            time: d.time,
            duration_minutes: d.durationMinutes || null,
          }))
        : []

      if (template) {
        const sharedTemplateFields = {
          name,
          description,
          capacity: parseInt(capacity),
          duration_minutes: durationMinutes,
          visibility: visibility,
          recurrence_start_date: showRepeatSection && recurrenceStartDate ? format(recurrenceStartDate, 'yyyy-MM-dd') : null,
          recurrence_end_date: showRepeatSection && recurrenceEndDate ? format(recurrenceEndDate, 'yyyy-MM-dd') : null,
          booking_instructions: bookingInstructions || null,
          image_url: imageUrl || null,
          event_color: eventColor,
          include_in_filter: includeInFilter,
        }

        // Detect if schedule-related fields changed. If only general/pricing/visibility
        // changed, update the template row only — no need to wipe and regenerate instances.
        const originalSchedules = (template.schedules ?? []).map((s: any) => ({
          time: s.time,
          days: [...(s.days ?? [])].map((d: string) => convertDayFormat(d, false)).sort().join(','),
          duration: s.duration_minutes ?? null,
        })).sort((a: any, b: any) => (a.time + a.days).localeCompare(b.time + b.days))

        const currentSchedules = showRepeatSection ? schedules.map((s: any) => ({
          time: s.time,
          days: [...(s.days || [])].map((d: string) => d.toLowerCase()).sort().join(','),
          duration: s.durationMinutes ?? null,
        })).sort((a: any, b: any) => (a.time + a.days).localeCompare(b.time + b.days)) : []

        const originalOneOffDates = (template.one_off_dates ?? []).map((d: any) => ({
          date: d.date,
          time: d.time,
          duration: d.duration_minutes ?? null,
        })).sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time))

        const currentOneOffDates = oneOffDatesParam.map((d: any) => ({
          date: d.date,
          time: d.time,
          duration: d.duration_minutes ?? null,
        })).sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time))

        const origStartDate = template.recurrence_start_date ?? null
        const origEndDate = template.recurrence_end_date ?? null
        const newStartDate = showRepeatSection && recurrenceStartDate ? format(recurrenceStartDate, 'yyyy-MM-dd') : null
        const newEndDate = showRepeatSection && recurrenceEndDate ? format(recurrenceEndDate, 'yyyy-MM-dd') : null

        const schedulesChanged =
          JSON.stringify(originalSchedules) !== JSON.stringify(currentSchedules) ||
          JSON.stringify(originalOneOffDates) !== JSON.stringify(currentOneOffDates) ||
          origStartDate !== newStartDate ||
          origEndDate !== newEndDate

        if (!schedulesChanged) {
          // Only general/pricing/visibility changed — update template fields only.
          // Instances inherit from the template via null-override, so this propagates immediately.
          const result = await updateSessionTemplate({ id: template.id, ...sharedTemplateFields })
          if (!result.success) {
            throw new Error(`Failed to update session: ${result.error}`)
          }
        } else {
          // Schedules or dates changed — rebuild instances. Check for affected bookings first.
          const scheduleParams = {
            templateId: template.id,
            template: sharedTemplateFields,
            schedules: showRepeatSection ? schedules.map((s: any) => ({
              time: s.time,
              days: (s.days || []).map((d: string) => d.toLowerCase()),
              duration_minutes: s.durationMinutes || null,
            })) : [],
            one_off_dates: oneOffDatesParam,
          }
          const result = await updateSessionWithSchedules(scheduleParams)

          if (result.requiresConfirmation) {
            // There are booked instances that will be cancelled — ask for confirmation.
            setLoading(false)
            setAffectedBookingCount(result.affectedBookingCount ?? 0)
            setPendingScheduleParams(scheduleParams)
            setIsScheduleConfirmDialogOpen(true)
            return
          }

          if (!result.success) {
            throw new Error(`Failed to update session: ${result.error}`)
          }
        }

        templateId = template.id;
      } else {
        // Create new template using server action
        const result = await createSessionTemplate({
          name,
          description,
          capacity: parseInt(capacity),
          duration_minutes: durationMinutes,
          visibility: visibility,
          recurrence_start_date: showRepeatSection && recurrenceStartDate ? format(recurrenceStartDate, 'yyyy-MM-dd') : null,
          recurrence_end_date: showRepeatSection && recurrenceEndDate ? format(recurrenceEndDate, 'yyyy-MM-dd') : null,
          created_by: user.id,
          booking_instructions: bookingInstructions || null,
          // Image field
          image_url: imageUrl || null,
          // Calendar display color
          event_color: eventColor,
          include_in_filter: includeInFilter,
          one_off_dates: oneOffDatesParam,
        });

        if (!result.success || !result.id) {
          throw new Error(`Failed to create template: ${result.error}`);
        }

        templateId = result.id;
      }

      if (!template && showRepeatSection) {
        // Schedule creation for new templates only — updates are handled by updateSessionWithSchedules

        // Validate schedules before creating
        if (!schedules || schedules.length === 0) {
          throw new Error("No schedules provided for recurring template");
        }

        // Create recurring schedules
        const scheduleResults = await Promise.all(
          schedules.map(async (schedule) => {
            try {
              // Defensive: ensure days is always an array
              const mappedDays = (schedule.days || []).map(day => day.toLowerCase());
              if (mappedDays.length === 0) {
                throw new Error("No days selected for schedule.");
              }
              if (mappedDays.some(d => !isValidDayString(d))) {
                throw new Error("Invalid day selected in schedule.");
              }


              const result = await createSessionSchedule({
                session_template_id: templateId,
                time: schedule.time,
                days: mappedDays,
                duration_minutes: schedule.durationMinutes || null
              });

              return result;
            } catch (error) {
              throw error;
            }
          })
        );


        const errors = scheduleResults.filter(r => !r.success);
        if (errors.length > 0) {
          throw new Error(`Failed to create schedules: ${errors[0].error}`);
        }

        // Fire-and-forget: generate instances in the background
        fetch(`${SUPABASE_URL}/functions/v1/generate-instances`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            template_id_to_process: templateId
          })
        }).catch(() => {
          // Instance generation failed silently — the scheduled job will pick it up
        });
      }

      // Save per-session price option settings
      if (pricingType === 'paid') {
        const activePriceOpts = priceOptions.filter(o => o.isActive)
        const priceOptionSettings = activePriceOpts.map((o) => {
          const isEnabled = priceOptionEnabled[o.id] ?? true
          const priceStr = priceOptionPrices[o.id]
          const spacesStr = priceOptionSpaces[o.id]
          const overridePrice = priceStr && parseFloat(priceStr) >= 0
            ? Math.round(parseFloat(priceStr) * 100)
            : null
          const overrideSpaces = spacesStr && parseInt(spacesStr) >= 1
            ? parseInt(spacesStr)
            : null
          return { priceOptionId: o.id, isEnabled, overridePrice, overrideSpaces }
        })
        await updateSessionPriceOptions(templateId, priceOptionSettings)
      } else {
        await updateSessionPriceOptions(templateId, [])
      }

      // Save per-session membership settings (enabled state + optional price override)
      if (pricingType === 'paid') {
        const activeMemberships = memberships.filter(m => m.isActive)
        if (activeMemberships.length > 0) {
          const membershipSettings = activeMemberships.map((m) => {
            const isEnabled = membershipEnabled[m.id] ?? true
            const priceStr = membershipPrices[m.id]
            const overridePrice = priceStr && parseFloat(priceStr) >= 0
              ? Math.round(parseFloat(priceStr) * 100)
              : null
            return {
              membershipId: m.id,
              isEnabled,
              overridePrice,
            }
          })
          const memResult = await updateSessionMembershipPrices(templateId, membershipSettings)
          if (!memResult.success) throw new Error(`Failed to save membership settings: ${memResult.error}`)
        }
      } else {
        // Clear any existing settings if session is free
        await updateSessionMembershipPrices(templateId, [])
      }

      toast({
        title: "Success",
        description: template ? "Session updated successfully" : "Session created successfully",
      });

      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("Session form error:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return

    setLoading(true)
    try {
      // Delete the template first
      const deleteTemplateResult = await deleteSessionTemplate(template.id)
      if (!deleteTemplateResult.success) {
        throw new Error(deleteTemplateResult.error || "Failed to delete template")
      }

      // The schedules and instances will be automatically deleted due to CASCADE
      // but we'll still try to delete them explicitly as a fallback
      try {
        await deleteSessionSchedules(template.id)
        await deleteSessionInstances(template.id)
      } catch (error) {
        // Don't throw here as the template was already deleted
      }

      toast({
        title: "Success",
        description: "Session deleted successfully",
      })

      onSuccess()
      onClose()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete session. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setIsDeleteDialogOpen(false)
    }
  }

  const handleConfirmedScheduleUpdate = async () => {
    if (!pendingScheduleParams) return
    setIsScheduleConfirmDialogOpen(false)
    setLoading(true)
    try {
      const result = await updateSessionWithSchedules({ ...pendingScheduleParams, cancelAffectedBookings: true })
      if (!result.success) {
        throw new Error(`Failed to update session: ${result.error}`)
      }
      setPendingScheduleParams(null)
      // Save price option settings
      if (pricingType === 'paid') {
        const activePriceOpts = priceOptions.filter(o => o.isActive)
        const priceOptionSettings = activePriceOpts.map((o) => {
          const isEnabled = priceOptionEnabled[o.id] ?? true
          const priceStr = priceOptionPrices[o.id]
          const spacesStr = priceOptionSpaces[o.id]
          const overridePrice = priceStr && parseFloat(priceStr) >= 0 ? Math.round(parseFloat(priceStr) * 100) : null
          const overrideSpaces = spacesStr && parseInt(spacesStr) >= 1 ? parseInt(spacesStr) : null
          return { priceOptionId: o.id, isEnabled, overridePrice, overrideSpaces }
        })
        await updateSessionPriceOptions(template!.id, priceOptionSettings)
      } else {
        await updateSessionPriceOptions(template!.id, [])
      }

      // Save membership prices
      if (pricingType === 'paid') {
        const activeMemberships = memberships.filter(m => m.isActive)
        if (activeMemberships.length > 0) {
          const membershipSettings = activeMemberships.map((m) => {
            const isEnabled = membershipEnabled[m.id] ?? true
            const priceStr = membershipPrices[m.id]
            const overridePrice = priceStr && parseFloat(priceStr) >= 0
              ? Math.round(parseFloat(priceStr) * 100)
              : null
            return { membershipId: m.id, isEnabled, overridePrice }
          })
          const memResult = await updateSessionMembershipPrices(template!.id, membershipSettings)
          if (!memResult.success) throw new Error(`Failed to save membership settings: ${memResult.error}`)
        }
      } else {
        await updateSessionMembershipPrices(template!.id, [])
      }
      toast({ title: "Success", description: "Session updated successfully" })
      onSuccess?.()
      onClose()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update session.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const addSchedule = () => {
    const newId = String(Date.now())
    const lastSchedule = schedules[schedules.length - 1]
    const newSchedule = lastSchedule
      ? { id: newId, time: lastSchedule.time, days: [...lastSchedule.days], durationMinutes: lastSchedule.durationMinutes ?? null }
      : { id: newId, time: "09:00", days: [], durationMinutes: null }
    setSchedules([...schedules, newSchedule])
  }

  const removeSchedule = async (id: string) => {
    if (!template) {
      // For new templates, just remove from local state
      setSchedules(schedules.filter((schedule) => schedule.id !== id))
      return
    }

    try {
      // For existing templates, delete from database
      const result = await deleteSchedule(id)
      if (!result.success) {
        throw new Error(result.error || "Failed to delete schedule")
      }

      // Update local state
      setSchedules(schedules.filter((schedule) => schedule.id !== id))
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete schedule. Please try again.",
        variant: "destructive",
      })
    }
  }

  const updateScheduleTime = (id: string, time: string) => {
    setSchedules(schedules.map((schedule) =>
      schedule.id === id ? { ...schedule, time } : schedule
    ))
  }

  const updateScheduleDuration = (id: string, minutes: number) => {
    setSchedules(schedules.map((schedule) =>
      schedule.id === id ? { ...schedule, durationMinutes: minutes } : schedule
    ))
  }

  const toggleDay = (scheduleId: string, day: string) => {
    setSchedules(
      schedules.map((schedule) => {
        if (schedule.id === scheduleId) {
          const newDays = schedule.days.includes(day) ? schedule.days.filter((d) => d !== day) : [...schedule.days, day]
          return { ...schedule, days: newDays }
        }
        return schedule
      }),
    )
  }

  const handleAddRepeatSection = () => {
    setShowRepeatSection(true)
    if (schedules.length === 0) {
      setSchedules([{ id: "1", time: "09:00", days: [], durationMinutes: null }])
    }
  }

  const handleAddDatesSection = () => {
    setShowDatesSection(true)
    if (oneOffDates.length === 0 || (oneOffDates.length === 1 && !oneOffDates[0].date)) {
      setOneOffDates([{ id: "1", date: undefined, time: "09:00", durationMinutes: durationMinutes || 75 }])
    }
  }

  const addOneOffDate = () => {
    const newId = String(Date.now())
    setOneOffDates(prev => [...prev, { id: newId, date: undefined, time: "09:00", durationMinutes: durationMinutes || 75 }])
  }

  const removeOneOffDate = (id: string) => {
    setOneOffDates(prev => {
      const next = prev.filter(d => d.id !== id)
      if (next.length === 0) {
        setShowDatesSection(false)
        return [{ id: "1", date: undefined, time: "09:00", durationMinutes: durationMinutes || 75 }]
      }
      return next
    })
  }

  const updateOneOffDate = (id: string, field: keyof OneOffDateItem, value: any) => {
    setOneOffDates(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  // Compute effective drop-in price from first enabled price option for membership display
  const computedDropInPricePence = useMemo(() => {
    const firstEnabled = priceOptions.filter(o => o.isActive && (priceOptionEnabled[o.id] ?? true))[0]
    if (!firstEnabled) return 0
    const override = priceOptionPrices[firstEnabled.id]
    if (override !== undefined && override !== '' && parseFloat(override) >= 0) {
      return Math.round(parseFloat(override) * 100)
    }
    return firstEnabled.price
  }, [priceOptions, priceOptionEnabled, priceOptionPrices])

  const getMembershipDisplayPrice = (membership: Membership, overridePriceStr: string): string => {
    if (overridePriceStr && parseFloat(overridePriceStr) >= 0) {
      return `£${parseFloat(overridePriceStr).toFixed(2)}`
    }
    const defaultPrice = getDefaultMembershipPrice(membership, computedDropInPricePence)
    return defaultPrice ? `£${parseFloat(defaultPrice).toFixed(2)}` : ''
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[625px] overflow-y-auto p-0">
        <div className="sticky top-0 bg-white z-20 px-6 py-4 border-b pr-12">
          <SheetHeader>
            <SheetTitle className="text-xl">{template ? "Edit Session" : "New Session"}</SheetTitle>
            <SheetDescription>
              {template ? "Any changes will update every instance of this session." : "Add a new session to your calendar."}
            </SheetDescription>
          </SheetHeader>
          <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 pb-0">
          {/* General Section */}
          <div className="overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium bg-gray-50 text-sm rounded-lg "
              onClick={() => setGeneralExpanded(!generalExpanded)}
            >
              <span>General</span>
              {generalExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {generalExpanded && (
              <div className="px-4 pb-4 pt-4 space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Session Name <span className="text-red-500">*</span>
                    </Label>
                  </div>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError("name") }}
                    className={cn(fieldErrors.name && "border-red-500 focus-visible:ring-red-500")}
                  />
                  {fieldErrors.name ? (
                    <p className="text-sm text-red-500">{fieldErrors.name}</p>
                  ) : (
                    <p className="text-sm text-gray-500"></p>
                  )}
                </div>

                {/* Capacity */}
                <div className="space-y-2 flex flex-col">
                  <Label htmlFor="capacity" className="text-sm font-medium">
                    Capacity <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => { setCapacity(e.target.value); clearError("capacity") }}
                    className={cn("max-w-xs", fieldErrors.capacity && "border-red-500 focus-visible:ring-red-500")}
                  />
                  {fieldErrors.capacity ? (
                    <p className="text-sm text-red-500">{fieldErrors.capacity}</p>
                  ) : (
                    <p className="text-sm text-gray-500">Maximum number of participants allowed.</p>
                  )}
                </div>


                {/* Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-sm font-medium">
                      Description
                    </Label>
                  </div>
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    disabled={loading}
                    minRows={3}
                  />
                  <p className="text-sm text-gray-500">Supports links, lists, bold & italic</p>
                </div>

                {/* Booking Instructions - moved from Payment section */}
                <div className="space-y-2">
                  <Label htmlFor="bookingInstructions" className="text-sm font-medium">
                    Booking Instructions
                  </Label>
                  <RichTextEditor
                    value={bookingInstructions}
                    onChange={setBookingInstructions}
                    disabled={loading}
                    minRows={4}
                  />
                  <p className="text-sm text-gray-500">Displayed on the confirmation page and email - include directions and tips on what to bring. Supports links, lists, bold & italic</p>
                </div>

                {/* Image Upload */}
                <ImageUpload
                  value={imageUrl}
                  onChange={setImageUrl}
                  disabled={loading}
                />

                {/* Event Color */}
                <div className="space-y-2">
                  <Label htmlFor="eventColor" className="text-sm font-medium">
                    Calendar Event Color
                  </Label>
                  <Select value={eventColor} onValueChange={(value: EventColorKey) => setEventColor(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded-full border border-gray-200"
                            style={{ backgroundColor: EVENT_COLORS[eventColor].color500 }}
                          />
                          <span>{EVENT_COLORS[eventColor].name}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_COLORS).map(([key, { name, color500 }]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-4 w-4 rounded-full border border-gray-200"
                              style={{ backgroundColor: color500 }}
                            />
                            <span>{name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500">Color displayed on booking and admin calendars.</p>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Section - Moved to top */}
          <div className="overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium bg-gray-50 text-sm rounded-lg"
              onClick={() => setScheduleExpanded(!scheduleExpanded)}
            >
              <span>Schedule</span>
              {scheduleExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {scheduleExpanded && (
              <div className="px-4 pb-4 pt-4 space-y-4">
                {/* Warning banner when editing template with instances */}
                {template && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Changes to schedules will regenerate future instances. Sessions with existing bookings won&apos;t be affected until cancelled individually.
                  </div>
                )}

                {/* Repeat section */}
                {showRepeatSection && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-gray-500" /> Repeat
                      </span>
                      {pendingDeleteRepeat ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { setShowRepeatSection(false); setSchedules([]); setPendingDeleteScheduleId(null); setPendingDeleteRepeat(false) }}
                        >
                          Delete Schedule?
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setPendingDeleteRepeat(true)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Start and End Dates */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !recurrenceStartDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {recurrenceStartDate ? format(recurrenceStartDate, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={recurrenceStartDate} onSelect={(newDate) => { if (newDate) { setRecurrenceStartDate(startOfDay(newDate)); setStartDateOpen(false) } }} initialFocus />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>End Date (Optional)</Label>
                          <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !recurrenceEndDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {recurrenceEndDate ? format(recurrenceEndDate, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={recurrenceEndDate} onSelect={(newDate) => { if (newDate) { setRecurrenceEndDate(startOfDay(newDate)); setEndDateOpen(false) } }} initialFocus />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      {/* Time blocks */}
                      <div className="space-y-3">
                        {schedules.map((schedule, idx) => (
                          <div key={schedule.id}>
                            {idx > 0 && <hr className="border-gray-100 mb-3" />}
                            <div className="space-y-3 relative">
                              {(schedules.length > 1 || !!template) && (
                                pendingDeleteScheduleId === schedule.id ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    className="absolute top-0 right-0 h-7 text-xs"
                                    onClick={() => { removeSchedule(schedule.id); setPendingDeleteScheduleId(null) }}
                                  >
                                    Clear?
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-0 right-0 h-6 w-6"
                                    onClick={() => setPendingDeleteScheduleId(schedule.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                              <div className="space-y-2" id={`schedule-days-${schedule.id}`}>
                                <Label className="text-sm font-medium">Days <span className="text-red-500">*</span></Label>
                                <div className={cn("flex flex-wrap gap-2 rounded-md p-1", fieldErrors[`schedule-days-${schedule.id}`] && "ring-1 ring-red-500")}>
                                  {daysOfWeek.map((day) => (
                                    <button key={day.value} type="button" onClick={() => { toggleDay(schedule.id, day.value); clearError(`schedule-days-${schedule.id}`) }}
                                      className={cn("px-3 py-1 rounded-md text-sm", schedule.days.includes(day.value) ? "bg-primary/5 border border-primary text-primary" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                                      {day.label}
                                    </button>
                                  ))}
                                </div>
                                {fieldErrors[`schedule-days-${schedule.id}`] && <p className="text-sm text-red-500">{fieldErrors[`schedule-days-${schedule.id}`]}</p>}
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`time-${schedule.id}`} className="text-sm font-medium">Time <span className="text-red-500">*</span></Label>
                                  <Input id={`time-${schedule.id}`} type="time" value={schedule.time} onChange={(e) => updateScheduleTime(schedule.id, e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`duration-${schedule.id}`} className="text-sm font-medium">Duration (mins) <span className="text-red-500">*</span></Label>
                                  <Input id={`duration-${schedule.id}`} type="number" min="1" value={schedule.durationMinutes ?? durationMinutes} onChange={(e) => updateScheduleDuration(schedule.id, parseInt(e.target.value) || 0)} />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-gray-50 border-t">
                      <Button type="button" variant="ghost" onClick={addSchedule} className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-none">
                        <Plus className="mr-1 h-3 w-3" /> Add time
                      </Button>
                    </div>
                  </div>
                )}

                {/* Dates section */}
                {showDatesSection && (
                  <>
                    <div className="border rounded-lg p-4 space-y-3">
                      {oneOffDates.map((item, idx) => (
                        <div key={item.id}>
                          {idx > 0 && <hr className="border-gray-100 mb-3" />}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label>
                              {pendingDeleteDateId === item.id ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs"
                                  onClick={() => { removeOneOffDate(item.id); setPendingDeleteDateId(null) }}
                                >
                                  Clear?
                                </Button>
                              ) : (
                                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={() => setPendingDeleteDateId(item.id)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <Popover open={openOneOffDateId === item.id} onOpenChange={(open) => setOpenOneOffDateId(open ? item.id : null)}>
                              <PopoverTrigger asChild>
                                <Button id={`one-off-date-${item.id}`} type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !item.date && "text-muted-foreground", fieldErrors[`one-off-date-${item.id}`] && "border-red-500")}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {item.date ? format(item.date, "PPP") : <span>Pick a date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={item.date} onSelect={(newDate) => { if (newDate) { updateOneOffDate(item.id, "date", startOfDay(newDate)); clearError(`one-off-date-${item.id}`); setOpenOneOffDateId(null) } }} initialFocus />
                              </PopoverContent>
                            </Popover>
                            {fieldErrors[`one-off-date-${item.id}`] && <p className="text-sm text-red-500">{fieldErrors[`one-off-date-${item.id}`]}</p>}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-sm font-medium">Time <span className="text-red-500">*</span></Label>
                                <Input type="time" value={item.time} onChange={(e) => updateOneOffDate(item.id, "time", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`one-off-duration-${item.id}`} className="text-sm font-medium">Duration (mins) <span className="text-red-500">*</span></Label>
                                <Input id={`one-off-duration-${item.id}`} type="number" min="1" value={item.durationMinutes || ""} onChange={(e) => { updateOneOffDate(item.id, "durationMinutes", parseInt(e.target.value) || 0); clearError(`one-off-duration-${item.id}`) }} className={cn(fieldErrors[`one-off-duration-${item.id}`] && "border-red-500 focus-visible:ring-red-500")} />
                                {fieldErrors[`one-off-duration-${item.id}`] && <p className="text-sm text-red-500">{fieldErrors[`one-off-duration-${item.id}`]}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="lg" className="w-full" onClick={addOneOffDate}>
                      <CalendarDays className="mr-2 h-3 w-3" /> Add Single Date
                    </Button>
                  </>
                )}

                {/* Error message if neither section active */}
                {fieldErrors.schedule && <p className="text-sm text-red-500">{fieldErrors.schedule}</p>}

                {/* Add section buttons */}
                <div className="flex gap-4 flex-col" id="schedule">
                  {!showRepeatSection && (
                    <Button type="button" variant="outline" size="lg" onClick={handleAddRepeatSection}>
                      <RefreshCw className="mr-2 h-3 w-3" /> Add Repeat Schedule
                    </Button>
                  )}
                  {!showDatesSection && (
                    <Button type="button" variant="outline" size="lg" onClick={handleAddDatesSection}>
                      <CalendarDays className="mr-2 h-3 w-3" /> Add Single Date
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Payment Section */}
          <div className="overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left font-medium bg-gray-50 text-sm rounded-lg"
              onClick={() => setPaymentExpanded(!paymentExpanded)}
            >
              <span>Pricing</span>
              {paymentExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {paymentExpanded && (
              <div className="px-4 pb-4">
                {/* Pricing Type Toggle */}
                <div className="space-y-2 py-4">
                  <div className="grid grid-cols-2 gap-4">
                  <Card
                      className={cn(
                        "cursor-pointer border rounded-lg",
                        pricingType === "paid" ? "border-primary bg-primary/5" : "border-gray-200",
                      )}
                      onClick={() => setPricingType("paid")}
                    >
                      <CardContent className="p-4 flex justify-between">
                      <div className="flex gap-2">
                            <CreditCard className="h-5 w-5 text-gray-500" />                          
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">Paid</span>
                            <span className="text-xs text-gray-500">Take Stripe payment</span>
                          </div>
                        </div>
                        {pricingType === "paid" && (
                          <div className="relative h-4 w-4  rounded-full bg-primary text-white flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card
                      className={cn(
                        "cursor-pointer border rounded-lg",
                        pricingType === "free" ? "border-primary bg-primary/5" : "border-gray-200",
                      )}
                      onClick={() => setPricingType("free")}
                    >
                      <CardContent className="p-4 flex justify-between">
                        <div className="flex gap-2">
                          <Gift className="h-5 w-5 text-gray-500" />
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">Free</span>
                            <span className="text-xs text-gray-500">No charge and no checkout</span>
                          </div>
                        </div>
                        {pricingType === "free" && (
                          <div className="relative h-4 w-4  rounded-full bg-primary text-white flex items-center justify-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>


                {pricingType === "paid" && stripeChargesEnabled === false && (
                  <div className="text-center py-8">
                    <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                      <CreditCard className="h-6 w-6 text-gray-400" />
                    </div>
                    <h4 className="text-base font-medium text-gray-900 mb-2">Connect Your Stripe Account</h4>
                    <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                      Connect a Stripe account to start accepting payments for your sessions.
                    </p>
                    <Button variant="outline" asChild>
                      <Link href={`/${slug}/admin/billing`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Set Up Stripe
                      </Link>
                    </Button>
                  </div>
                )}

                {pricingType === "paid" && stripeChargesEnabled !== false && (
                  <div className="space-y-2">
                    {fieldErrors.pricingOptions && (
                      <p className="text-sm text-red-500">{fieldErrors.pricingOptions}</p>
                    )}

                    <div className="overflow-hidden">
                      {/* Per-price-option rows */}
                      {priceOptions.filter(o => o.isActive).map((option) => {
                        const isEnabled = priceOptionEnabled[option.id] ?? true
                        const isEditing = priceOptionEditing[option.id] ?? false
                        const currentPrice = priceOptionPrices[option.id] || ''
                        const currentSpaces = priceOptionSpaces[option.id] || ''
                        const displayPrice = currentPrice ? `£${parseFloat(currentPrice).toFixed(2)}` : `£${(option.price / 100).toFixed(2)}`
                        const displaySpaces = currentSpaces ? parseInt(currentSpaces) : option.spaces
                        return (
                          <div key={option.id} className="px-3 py-2.5 space-y-1.5">
                            <div className="flex items-center gap-3">
                              <p className="flex-1 text-sm font-medium">{option.name}</p>
                              {isEnabled && (
                                <button
                                  type="button"
                                  onClick={() => setPriceOptionEditing(prev => ({ ...prev, [option.id]: !prev[option.id] }))}
                                  className="text-xs text-primary underline underline-offset-2 hover:no-underline whitespace-nowrap"
                                >
                                  {isEditing ? 'Done' : 'Edit'}
                                </button>
                              )}
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => {
                                  setPriceOptionEnabled(prev => ({ ...prev, [option.id]: checked }))
                                  if (!checked) setPriceOptionEditing(prev => ({ ...prev, [option.id]: false }))
                                  clearError("pricingOptions")
                                }}
                              />
                            </div>
                            {isEnabled && !isEditing && (
                              <p className="text-xs text-gray-500">
                                {displayPrice} · {displaySpaces} {displaySpaces === 1 ? 'space' : 'spaces'}
                              </p>
                            )}
                            {isEnabled && isEditing && (
                              <div className="space-y-1.5">
                                <div className="flex gap-2">
                                  <div className="relative w-28">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">£</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder={(option.price / 100).toFixed(2)}
                                      value={currentPrice}
                                      autoFocus
                                      onChange={(e) => setPriceOptionPrices(prev => ({ ...prev, [option.id]: e.target.value }))}
                                      className="pl-5 h-7 text-xs"
                                    />
                                  </div>
                                  <div className="relative w-24">
                                    <Input
                                      type="number"
                                      min="1"
                                      step="1"
                                      placeholder={`${option.spaces} space${option.spaces === 1 ? '' : 's'}`}
                                      value={currentSpaces}
                                      onChange={(e) => setPriceOptionSpaces(prev => ({ ...prev, [option.id]: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400">Overrides the default for this session only</p>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {priceOptions.filter(o => o.isActive).length === 0 && !loadingPriceOptions && (
                        <div className="px-3 py-2.5">
                          <p className="text-sm text-gray-500 italic">
                            No ticket types configured.{' '}
                            <Link href={`/${slug}/admin/billing`} className="text-primary underline underline-offset-2">
                              Add ticket types in Billing
                            </Link>
                            {' '}to control per-ticket pricing.
                          </p>
                        </div>
                      )}

                      {/* Divider between price options and memberships */}
                      {(priceOptions.filter(o => o.isActive).length > 0 || !loadingPriceOptions) &&
                        (memberships.filter(m => m.isActive).length > 0 || !loadingMemberships) && (
                        <hr className="my-1" />
                      )}

                      {/* Per-membership rows */}
                      {memberships.filter(m => m.isActive).map((membership) => {
                        const isEnabled = membershipEnabled[membership.id] ?? true
                        const isEditing = membershipPriceEditing[membership.id] ?? false
                        const currentPrice = membershipPrices[membership.id] || ''
                        const displayPrice = getMembershipDisplayPrice(membership, currentPrice)
                        return (
                          <div key={membership.id} className="px-3 py-2.5 space-y-1.5">
                            <div className="flex items-center gap-3">
                              <p className="flex-1 text-sm font-medium flex items-center gap-1.5">
                                {membership.name}
                                {!membership.showOnMembershipPage && (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p>Hidden — only accessible via direct link</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </p>
                              {isEnabled && (
                                <button
                                  type="button"
                                  onClick={() => setMembershipPriceEditing(prev => ({ ...prev, [membership.id]: !prev[membership.id] }))}
                                  className="text-xs text-primary underline underline-offset-2 hover:no-underline whitespace-nowrap"
                                >
                                  {isEditing ? 'Done' : 'Edit'}
                                </button>
                              )}
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => {
                                  setMembershipEnabled(prev => ({ ...prev, [membership.id]: checked }))
                                  if (!checked) setMembershipPriceEditing(prev => ({ ...prev, [membership.id]: false }))
                                  clearError("pricingOptions")
                                }}
                              />
                            </div>
                            {isEnabled && !isEditing && displayPrice && (
                              <p className="text-xs text-gray-500">{displayPrice}</p>
                            )}
                            {isEnabled && isEditing && (
                              <div className="space-y-1.5">
                                <div className="relative w-32">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">£</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder={getDefaultMembershipPrice(membership, computedDropInPricePence) || '0.00'}
                                    value={currentPrice}
                                    autoFocus
                                    onChange={(e) => setMembershipPrices(prev => ({ ...prev, [membership.id]: e.target.value }))}
                                    className="pl-7 h-7 text-xs"
                                  />
                                </div>
                                <p className="text-xs text-gray-400">Overrides the default for this session only</p>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {memberships.filter(m => m.isActive).length === 0 && !loadingMemberships && (
                        <div className="px-3 py-2.5">
                          <p className="text-sm text-gray-500 italic">
                            No memberships configured. Create memberships in Billing settings to offer member pricing.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Section */}
          <div className="rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50">
              <span className="font-medium text-sm">Visibility</span>
            </div>
            <div className="px-4 py-4 space-y-4">
              <Select value={visibility} onValueChange={(value: 'open' | 'hidden' | 'closed') => setVisibility(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      <span>Open</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="hidden">
                    <div className="flex items-center gap-2">
                      <EyeOff className="h-4 w-4" />
                      <span>Hidden</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="closed">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span>Closed</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {visibility === 'open' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Can be found and booked from the public calendar.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Include in calendar filter</p>
                      <p className="text-sm text-muted-foreground">
                        Let users filter the calendar by this session type.
                      </p>
                    </div>
                    <Switch checked={includeInFilter} onCheckedChange={setIncludeInFilter} />
                  </div>
                </>
              )}
              {visibility === 'hidden' && (
                <p className="text-sm text-muted-foreground">
                  The public won&apos;t find the session, but a link can be shared privately and the session booked as normal. Use this setting to host private or restricted sessions.
                </p>
              )}
              {visibility === 'closed' && (
                <p className="text-sm text-muted-foreground">
                  Cannot be found or booked.
                </p>
              )}
            </div>
          </div>

          {/* Delete Session */}
          {template && (
            <div className="space-y-3">
              <Label className="text-base font-medium text-destructive">
                Delete Session
              </Label>
              <p className="text-sm text-muted-foreground">
                This will permanently delete the session template, all scheduled
                instances, and any associated bookings. This action cannot be
                undone.
              </p>
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="text-destructive border-destructive hover:bg-destructive/10"
                    disabled={loading || deleting}
                  >
                    {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Delete Session
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete session?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>
                          This will permanently delete &ldquo;{name}&rdquo; and all its scheduled instances. This action cannot be undone.
                        </p>
                        {(() => {
                          const activeBookings = (template?.instances ?? []).flatMap(i =>
                            (i.bookings ?? []).filter(b => !b.status || b.status === 'confirmed' || b.status === 'completed')
                          )
                          return activeBookings.length > 0 ? (
                            <p className="font-medium text-destructive">
                              {activeBookings.length} active booking{activeBookings.length !== 1 ? 's' : ''} will be cancelled and refunded.
                            </p>
                          ) : null
                        })()}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* Sticky Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 -mx-6 -mb-4">
            <div className="flex justify-between w-full">
              <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary" disabled={loading}>
                {loading ? "Saving..." : template ? "Save Changes" : "Create Session"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>

      {/* Confirmation dialog shown when saving a schedule change would cancel existing bookings */}
      <AlertDialog open={isScheduleConfirmDialogOpen} onOpenChange={setIsScheduleConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel affected bookings?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Updating this schedule will affect <span className="font-medium">{affectedBookingCount} booking{affectedBookingCount !== 1 ? 's' : ''}</span> on future sessions.
                </p>
                <p>
                  Those bookings will be cancelled and refunded, and users will be notified by email.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingScheduleParams(null)}>Keep current schedule</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedScheduleUpdate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel bookings &amp; update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
