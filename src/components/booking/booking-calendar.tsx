"use client"

import { useState, useEffect, useMemo } from "react"
import { Calendar as BigCalendar, momentLocalizer, View, Components, EventProps, Event } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/styles/calendar.css'
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Users, EyeOff } from "lucide-react"
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfWeek, endOfWeek } from "date-fns"
import { SessionTemplate } from "@/types/session"
import { useRouter } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileCalendarView } from "./mobile-calendar-view"
import { MobileSessionList } from "./mobile-session-list"
import { useUser } from "@clerk/nextjs"
import { getInternalUserId } from "@/app/actions/session"
import { getEventColorValues } from "@/lib/event-colors"
import { SessionFilter } from "./session-filter"

// Add custom styles to hide rbc-event-label
const calendarStyles = `
  .rbc-event-label {
    display: none !important;
  }
`

// Configure moment to start week on Monday
moment.locale('en', {
  week: {
    dow: 1 // Monday is the first day of the week
  }
})

const localizer = momentLocalizer(moment)

// 24-hour time format for the time gutter
const calendarFormats = {
  timeGutterFormat: 'HH:mm',
}

// Extend the Event type from react-big-calendar
interface CalendarEvent extends Event {
  id: string
  title: string
  start: Date
  end: Date
  resource: SessionTemplate & {
    instances?: Array<{
      id: string
      start_time: string
      end_time: string
      bookings?: Array<{
        id: string
        number_of_spots: number
        user: {
          clerk_user_id: string
        }
      }>
    }>
  }
  isBooked?: boolean
  bookingId?: string
}

interface BookingCalendarProps {
  sessions: SessionTemplate[]
  slug: string
  isAdmin?: boolean
}

// Add the CustomEvent component with proper typing
const CustomEvent = ({ event }: EventProps<CalendarEvent>) => {
  const totalCapacity = event.resource.capacity || 10
  const instance = event.resource.instances?.find(i => {
    const instanceStart = new Date(i.start_time)
    return instanceStart.getTime() === event.start.getTime()
  })

  // Calculate total spots booked by summing number_of_spots from all bookings
  const totalSpotsBooked = instance?.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0
  const availableSpots = totalCapacity - totalSpotsBooked

  // Check if this is a free (locked) session
  const isFreeSession = event.resource.pricing_type === 'free'

  // Check if this is a hidden session (only admins see these)
  const isHidden = event.resource.visibility === 'hidden'

  const isFull = availableSpots === 0

  return (
    <div className="session-event-content">
      <div className="session-meta flex justify-between items-center">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {isFull ? 'Waiting List' : availableSpots}
        </span>
        <span className="flex items-center gap-1">
          {isFreeSession && <span className="text-[10px] font-semibold uppercase">Free</span>}
          {isHidden && <EyeOff className="h-3 w-3" />}
        </span>
      </div>
      <div className="session-name">
        {event.resource.name}
      </div>
      <div className="session-meta">
        {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
      </div>
    </div>
  )
}

export function BookingCalendar({ sessions, slug, isAdmin = false }: BookingCalendarProps) {
  const router = useRouter()
  const { user } = useUser()
  const isMobile = useIsMobile()
  const [currentView, setCurrentView] = useState<View>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [internalUserId, setInternalUserId] = useState<string | null>(null)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  // isAdmin is now passed as a prop from the server component

  useEffect(() => {
    const fetchInternalUserId = async () => {
      if (!user?.id) return
      const result = await getInternalUserId(user.id)
      if (result.success && result.userId) {
        setInternalUserId(result.userId)
      }
    }
    fetchInternalUserId()
  }, [user])

  // Update view based on screen size
  useEffect(() => {
    setCurrentView(isMobile ? 'day' : 'week')
  }, [isMobile])

  const filteredSessions = useMemo(() =>
    selectedTemplateIds.length === 0
      ? sessions
      : sessions.filter(s => selectedTemplateIds.includes(s.id)),
  [sessions, selectedTemplateIds])

  // Convert sessions to events format for react-big-calendar
  // Memoize to prevent expensive recalculation on every render
  const events = useMemo(() => filteredSessions.flatMap((template): CalendarEvent[] => {
    if (template.instances && template.instances.length > 0) {
      return template.instances.map(instance => {
        const startTime = new Date(instance.start_time);
        const endTime = new Date(instance.end_time);
        const formattedStartTime = format(startTime, 'h:mm a');
        const formattedEndTime = format(endTime, 'h:mm a');

        const userBooking = instance.bookings?.find(booking => {
          return booking.user && booking.user.clerk_user_id === user?.id;
        });

        return {
          id: instance.id,
          title: `${formattedStartTime} – ${formattedEndTime}: ${template.name}`,
          start: startTime,
          end: endTime,
          resource: template,
          isBooked: !!userBooking,
          bookingId: userBooking?.id
        }
      })
    }

    // For recurring templates without instances, use the schedules to create events
    if (template.is_recurring && template.schedules) {
      const scheduleEvents: CalendarEvent[] = []

      template.schedules.forEach(schedule => {
        schedule.days.forEach(day => {
          const [hours, minutes] = schedule.time.split(':').map(Number)

          // Create events for each occurrence within the date range
          let iterDate = new Date()
          const rangeEndDate = new Date()
          rangeEndDate.setMonth(rangeEndDate.getMonth() + 3) // Show next 3 months

          while (iterDate <= rangeEndDate) {
            // Check if this day matches the schedule day
            const iterDay = format(iterDate, 'EEEE').toLowerCase()
            const scheduleDay = day.toLowerCase()

            if (iterDay === scheduleDay) {
              // Use schedule-specific duration if available, otherwise fall back to template default
              const effectiveDuration = schedule.duration_minutes || template.duration_minutes;

              // Create event date by combining the current date with the schedule time
              const eventDate = new Date(
                iterDate.getFullYear(),
                iterDate.getMonth(),
                iterDate.getDate(),
                hours,
                minutes,
                0,
                0
              )

              // Create end time
              const eventEndDate = new Date(
                iterDate.getFullYear(),
                iterDate.getMonth(),
                iterDate.getDate(),
                hours,
                minutes + effectiveDuration,
                0,
                0
              )

              scheduleEvents.push({
                id: `${template.id}-${schedule.id}-${day}-${eventDate.toISOString()}`,
                title: template.name,
                start: eventDate,
                end: eventEndDate,
                resource: template
              })
            }

            // Move to next day
            iterDate.setDate(iterDate.getDate() + 1)
          }
        })
      })

      return scheduleEvents
    }

    return []
  }), [filteredSessions, user?.id])

  // Calculate time range based on sessions
  const calculateTimeRange = () => {
    if (events.length === 0) {
      // Default to 7am-9pm if no events
      return {
        min: new Date(0, 0, 0, 7, 0, 0),
        max: new Date(0, 0, 0, 21, 0, 0)
      }
    }

    // Find earliest start and latest end times
    let earliestStartHour = 23
    let latestEndHour = 0
    let latestEndMinutes = 0

    events.forEach(event => {
      const startHour = event.start.getHours()
      const endHour = event.end.getHours()
      const endMinutes = event.end.getMinutes()

      if (startHour < earliestStartHour) {
        earliestStartHour = startHour
      }
      if (endHour > latestEndHour || (endHour === latestEndHour && endMinutes > latestEndMinutes)) {
        latestEndHour = endHour
        latestEndMinutes = endMinutes
      }
    })

    // Ceiling the end hour if session ends with minutes (e.g., 20:30 → 21:00)
    const maxHour = latestEndMinutes > 0 ? latestEndHour + 1 : latestEndHour

    return {
      min: new Date(0, 0, 0, earliestStartHour, 0, 0),
      max: new Date(0, 0, 0, Math.min(24, maxHour), 0, 0)
    }
  }

  const timeRange = calculateTimeRange()

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate])

  const eventsInCurrentWeek = useMemo(
    () => events.filter(e => e.start >= weekStart && e.start <= weekEnd),
    [events, weekStart, weekEnd]
  )

  const nextEventAfterWeek = useMemo(
    () => events.filter(e => e.start > weekEnd).sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null,
    [events, weekEnd]
  )

  const handleSelectEvent = (event: CalendarEvent) => {
    if (event.isBooked && event.bookingId) {
      // Only allow editing
      const queryParams = new URLSearchParams({
        start: event.start.toISOString(),
        edit: 'true',
        bookingId: event.bookingId
      });
      router.push(`/${slug}/${event.resource.id}?${queryParams.toString()}`)
      return
    }
    if (!event.isBooked) {
      // Only allow new booking if not already booked
      const queryParams = new URLSearchParams({
        start: event.start.toISOString()
      });
      router.push(`/${slug}/${event.resource.id}?${queryParams.toString()}`)
    }
  }

  const navigatePeriod = (direction: 'prev' | 'next') => {
    switch (currentView) {
      case 'month':
        setCurrentDate(direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1))
        break
      case 'week':
        setCurrentDate(direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1))
        break
      case 'day':
        setCurrentDate(direction === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1))
        break
    }
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setCurrentDate(date)
  }

  // Update the components type
  const components: Components<CalendarEvent> = {
    toolbar: () => null,
    event: CustomEvent,
    header: ({ date, label }) => {
      // For week and day views, split into day name and date number
      if (currentView === 'week' || currentView === 'day') {
        const dayName = format(date, 'EEE').toUpperCase() // SUN, MON, etc.
        const dateNumber = format(date, 'd') // 21, 22, etc.
        return (
          <div className="rbc-header">
            <span>{dayName}</span>
            <span>{dateNumber}</span>
          </div>
        )
      }
      // For month view, use default
      return <div className="rbc-header">{label}</div>
    }
  }

  // For mobile view
  if (isMobile) {
    return (
      <div className="flex flex-col">
        <div className="sticky top-0 z-10">
          <MobileCalendarView
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            sessions={filteredSessions}
            allSessions={sessions}
            selectedTemplateIds={selectedTemplateIds}
            onFilterChange={setSelectedTemplateIds}
          />
        </div>
        <div>
          <MobileSessionList
            sessions={filteredSessions}
            selectedDate={selectedDate}
            slug={slug}
            isAdmin={isAdmin}
            onDateSelect={handleDateSelect}
          />
        </div>
      </div>
    )
  }

  // For desktop view
  return (
    <div className="border border-gray-200 rounded-lg overflow-clip">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-40 bg-white border-b h-[75px] flex items-center px-4">
        <div className="flex items-center justify-between w-full gap-4">
          <div className="text-lg font-semibold shrink-0">
            {format(currentDate, 'MMMM yyyy')}
          </div>
          {eventsInCurrentWeek.length === 0 && (
            <div className="flex flex-col items-center text-sm text-muted-foreground">
              {sessions.length === 0 ? (
                <span>No sessions available</span>
              ) : (
                <>
                  <span>No sessions this week</span>
                  {nextEventAfterWeek && (
                    <button
                      onClick={() => setCurrentDate(nextEventAfterWeek.start)}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Skip to the next session →
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex items-center space-x-2 shrink-0">
            <SessionFilter
              sessions={sessions}
              selectedIds={selectedTemplateIds}
              onSelectionChange={setSelectedTemplateIds}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigatePeriod('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigatePeriod('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {/* Calendar without fixed height */}
      <BigCalendar
        localizer={localizer}
        formats={calendarFormats}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 'auto', minHeight: '60vh' }}
        onSelectEvent={handleSelectEvent}
        view={currentView}
        onView={setCurrentView}
        date={currentDate}
        onNavigate={setCurrentDate}
        step={30}
        timeslots={2}
        min={timeRange.min}
        max={timeRange.max}
        eventPropGetter={(event: CalendarEvent) => {
          const customColor = event.resource.event_color
          const isHidden = event.resource.visibility === 'hidden'

          // Calculate availability for full/sold out state
          const instance = event.resource.instances?.find(i => {
            const instanceStart = new Date(i.start_time)
            return instanceStart.getTime() === event.start.getTime()
          })
          const totalSpotsBooked = instance?.bookings?.reduce((sum, b) => sum + (b.number_of_spots || 1), 0) || 0
          const availableSpots = (event.resource.capacity || 10) - totalSpotsBooked
          const isFull = availableSpots === 0

          // Determine session type class
          // Priority: booked > hidden > free > full > default
          let typeClass = 'session-default'
          if (event.isBooked) {
            typeClass = 'session-booked'
          } else if (isHidden) {
            typeClass = 'session-hidden'
          } else if (isFull) {
            typeClass = 'session-full'
          }

          // Build style object with custom color if provided (and not overridden by special states)
          const style: React.CSSProperties = {}
          if (customColor && !event.isBooked && !isHidden && !isFull) {
            const colors = getEventColorValues(customColor)
            style.borderLeftColor = colors.color500
            style.backgroundColor = `${colors.color500}1A` // 10% opacity
            style.color = colors.color700
          }

          return {
            className: `session-event ${typeClass}`,
            style,
          }
        }}
        components={components}
      />

    </div>
  )
}
