"use client"

import { format, addDays, startOfDay } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { SAUNA_TIMEZONE, formatLocalDate } from "@/lib/time-utils"
import { SessionTemplate, SessionInstance } from "@/types/session"
import { Card, CardContent } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { Users, EyeOff } from "lucide-react"
import { getEventColorValues } from "@/lib/event-colors"

interface MobileSessionListProps {
  sessions: SessionTemplate[]
  selectedDate: Date
  slug: string
  isAdmin?: boolean
  onDateSelect?: (date: Date) => void
  bookedInstances?: Record<string, string>
}

function isInstanceAvailable(instance: SessionInstance, capacity: number): boolean {
  const totalSpotsBooked = instance.bookings?.reduce((sum, b) => sum + (b.number_of_spots || 1), 0) || 0
  return totalSpotsBooked < capacity
}

function findNextAvailableSessionDate(sessions: SessionTemplate[], afterDate: Date): Date | null {
  // Compare date strings to avoid timezone ambiguity
  const afterStr = format(afterDate, 'yyyy-MM-dd')
  let nextDateStr: string | null = null

  for (const template of sessions) {
    if (template.instances && template.instances.length > 0) {
      // Use timezone-aware date string for instance comparison (same as MobileCalendarView)
      for (const instance of template.instances) {
        const instanceStr = formatLocalDate(new Date(instance.start_time), SAUNA_TIMEZONE)
        if (instanceStr > afterStr && (!nextDateStr || instanceStr < nextDateStr) && isInstanceAvailable(instance, template.capacity || 10)) {
          nextDateStr = instanceStr
        }
      }
    } else if ((template.schedules?.length ?? 0) > 0 && template.schedules) {
      // No instances: find the next matching weekday from the schedule
      for (const schedule of template.schedules) {
        for (const day of schedule.days) {
          let candidate = addDays(startOfDay(afterDate), 1)
          for (let i = 0; i < 7; i++) {
            if (format(candidate, 'EEEE').toLowerCase() === day.toLowerCase()) {
              const candidateStr = format(candidate, 'yyyy-MM-dd')
              const withinRange = !template.recurrence_end_date ||
                candidateStr <= format(new Date(template.recurrence_end_date), 'yyyy-MM-dd')
              if (withinRange && (!nextDateStr || candidateStr < nextDateStr)) {
                nextDateStr = candidateStr
              }
              break
            }
            candidate = addDays(candidate, 1)
          }
        }
      }
    }
  }

  return nextDateStr ? startOfDay(new Date(nextDateStr)) : null
}

export function MobileSessionList({ sessions, selectedDate, slug, onDateSelect, bookedInstances = {} }: MobileSessionListProps) {
  const router = useRouter()
  // Build a flat list of all sessions for the selected day directly from sessions
  const sessionsForDay = sessions.flatMap((template) => {
    const results: { template: SessionTemplate; startTime: Date; endTime: Date; key: string; instance?: SessionInstance; isBooked: boolean; bookingId?: string }[] = []

    // Check instances for this day
    if (template.instances && template.instances.length > 0) {
      template.instances.forEach(instance => {
        const instanceDate = new Date(instance.start_time)
        if (formatLocalDate(instanceDate, SAUNA_TIMEZONE) === format(selectedDate, 'yyyy-MM-dd')) {
          const bookingId = bookedInstances[instance.id]
          results.push({
            template,
            startTime: instanceDate,
            endTime: new Date(instance.end_time),
            key: instance.id,
            instance,
            isBooked: !!bookingId,
            bookingId,
          })
        }
      })
    }

    // If no instances found, check recurring schedule
    if (results.length === 0 && (template.schedules?.length ?? 0) > 0 && template.schedules) {
      const dayName = format(selectedDate, 'EEEE').toLowerCase()
      const schedule = template.schedules.find(s =>
        s.days.some(d => d.toLowerCase() === dayName)
      )

      if (schedule) {
        const [hours, minutes] = schedule.time.split(':').map(Number)
        const effectiveDuration = schedule.duration_minutes || template.duration_minutes
        const startTime = new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          hours,
          minutes,
          0,
          0
        )
        const endTime = new Date(startTime.getTime() + effectiveDuration * 60000)

        results.push({
          template,
          startTime,
          endTime,
          key: `${template.id}-${startTime.toISOString()}`,
          isBooked: false,
        })
      }
    }

    return results
  })

  // Sort by start time
  sessionsForDay.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  // Hide sessions that have already ended when viewing today (non-admin only)
  const isViewingToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  const now = new Date()
  const visibleSessionsForDay = isViewingToday
    ? sessionsForDay.filter(s => s.endTime > now)
    : sessionsForDay

  const handleSessionClick = (template: SessionTemplate, startTime: Date, isBooked: boolean, bookingId?: string) => {
    if (isBooked && bookingId) {
      router.push(`/${slug}/${template.id}?start=${startTime.toISOString()}&edit=true&bookingId=${bookingId}`)
      return
    }
    router.push(`/${slug}/${template.id}?start=${startTime.toISOString()}`)
  }

  const allFull = visibleSessionsForDay.length > 0 && visibleSessionsForDay.every(({ template, instance }) => {
    if (!instance) return false // schedule-based, assume available
    const totalCapacity = template.capacity || 10
    const totalSpotsBooked = instance.bookings?.reduce((sum, b) => sum + (b.number_of_spots || 1), 0) || 0
    return totalSpotsBooked >= totalCapacity
  })

  if (visibleSessionsForDay.length === 0) {
    const nextDate = findNextAvailableSessionDate(sessions, selectedDate)
    return (
      <div className="p-4 text-center text-muted-foreground space-y-1">
        {nextDate ? (
          <>
            <p className="text-sm">No sessions on this day</p>
            <button
              onClick={() => onDateSelect?.(nextDate)}
              className="text-primary underline-offset-4 hover:underline"
            >
              Skip to the next available session →
            </button>
          </>
        ) : (
          <p>No sessions available</p>
        )}
      </div>
    )
  }

  const nextAvailableDate = allFull ? findNextAvailableSessionDate(sessions, selectedDate) : null

  return (
    <div className="space-y-0 ">
      {allFull && nextAvailableDate && (
        <div className="p-4 text-center text-muted-foreground space-y-1 border-b">
          <p className="text-sm">All sessions today are full</p>
          <button
            onClick={() => onDateSelect?.(nextAvailableDate)}
            className="text-primary underline-offset-4 hover:underline"
          >
            Skip to the next available session →
          </button>
        </div>
      )}
      {visibleSessionsForDay.map(({ template, startTime, endTime, key, instance, isBooked, bookingId }) => {
        const isFreeSession = template.pricing_type === 'free'
        const isHidden = template.visibility === 'hidden'
        const totalCapacity = template.capacity || 10
        const totalSpotsBooked = instance?.bookings?.reduce((sum, b) => sum + (b.number_of_spots || 1), 0) || 0
        const availableSpots = totalCapacity - totalSpotsBooked
        const isFull = availableSpots === 0

        const eventColor = getEventColorValues(template.event_color)

        return (
          <Card
            key={key}
            className={`cursor-pointer transition-all duration-75 active:scale-[0.96] active:opacity-60 ${
              isBooked ? 'border-primary bg-primary/5' : isFull ? 'border-gray-200 bg-gray-50' : ''
            }`}
            onClick={() => handleSessionClick(template, startTime, isBooked, bookingId)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className="mt-2 ml-2 h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: (isFull && !isBooked) ? '#9CA3AF' : eventColor.color500 }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium text-lg flex items-center gap-1 ${(isFull && !isBooked) ? 'text-gray-300 text-muted-foreground' : ''}`}>
                    {isFreeSession && <span className="text-[10px] font-semibold uppercase text-muted-foreground">Free</span>}
                    {isHidden && <EyeOff className="h-3 w-3 text-gray-400" />}
                    {template.name}
                  </h3>
                  <div className="mt-1 flex items-center text-md text-muted-foreground gap-x-3">
                    <span>{instance ? formatInTimeZone(startTime, SAUNA_TIMEZONE, "HH:mm") : format(startTime, "HH:mm")} - {instance ? formatInTimeZone(endTime, SAUNA_TIMEZONE, "HH:mm") : format(endTime, "HH:mm")}</span>
                    <span className="text-gray-300">·</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {isBooked ? 'Booked' : isFull ? 'Waiting List' : availableSpots}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

    </div>
  )
} 