"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { List, ChevronLeft, ChevronRight, Calendar, RefreshCw, Pencil, Users, Lock, ArrowUp, ArrowDown, EyeOff } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfWeek as dateFnsStartOfWeek, endOfWeek as dateFnsEndOfWeek, startOfDay, endOfDay, getDay } from "date-fns"
import { SessionTemplate } from "@/types/session"
import { cn } from "@/lib/utils"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { Calendar as BigCalendar, momentLocalizer, View, Components, EventProps, Event } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/styles/calendar.css'
import { mapIntToDayString } from "@/lib/day-utils"
import { getEventColorValues } from "@/lib/event-colors"

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

interface CalendarEvent extends Event {
  id: string
  title: string
  start: Date
  end: Date
  resource: SessionTemplate
}

interface CalendarViewProps {
  sessions: SessionTemplate[]
  onEditSession: (session: SessionTemplate) => void
  onCreateSession: (start: Date, end: Date) => void
  onDeleteSession?: (session: SessionTemplate) => void
  showControls?: boolean
}

// Custom event component matching the public booking calendar style
const CustomEvent = ({ event }: EventProps<CalendarEvent>) => {
  const totalCapacity = event.resource.capacity || 10
  // Find the instance for this event
  const instance = event.resource.instances?.find(i => {
    const instanceStart = new Date(i.start_time)
    return instanceStart.getTime() === event.start.getTime()
  })
  // Sum number_of_spots across all bookings for this instance
  const totalSpotsBooked = instance?.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0
  const availableSpots = totalCapacity - totalSpotsBooked

  // Check if this is a free (locked) session
  const isFreeSession = event.resource.pricing_type === 'free'
  const isFull = availableSpots === 0

  // Check visibility status
  const visibility = event.resource.visibility ?? 'open'
  const isHidden = visibility === 'hidden'
  const isClosed = visibility === 'closed'

  return (
    <div className="session-event-content">
      <div className="session-meta flex justify-between items-center">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {isFull ? 'Waiting List' : `${totalSpotsBooked}/${totalCapacity}`}
        </span>
        <span className="flex items-center gap-1">
          {isFreeSession && <Lock className="h-3 w-3" />}
          {isHidden && <EyeOff className="h-3 w-3" />}
          {isClosed && <Lock className="h-3 w-3" />}
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

type SortDirection = "asc" | "desc" | null
type SortColumn = "name" | "schedule" | "capacity" | "status" | null

export function CalendarView({ sessions, onEditSession, onCreateSession, onDeleteSession, showControls = true }: CalendarViewProps) {
  const { view, setView, date, setDate } = useCalendarView()
  const [currentView, setCurrentView] = useState<View>('week')
  const [isMobile, setIsMobile] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  // Debug logging for sessions data
  useEffect(() => {
  }, [sessions])

  // Handle responsive view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setCurrentView('day')
      } else {
        setCurrentView('week')
      }
    }

    // Check on mount
    checkMobile()

    // Add resize listener
    window.addEventListener('resize', checkMobile)

    // Cleanup
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Convert sessions to events
  const events = sessions.flatMap((session) => {
    const events: CalendarEvent[] = [];

    // Process recurring templates
    if (session.is_recurring && session.schedules) {
      session.schedules.forEach((schedule) => {
        const [hours, minutes] = schedule.time.split(':').map(Number);

        // Get the date range based on the current view
        let startDate: Date;
        let endDate: Date;

        if (currentView === 'month') {
          startDate = startOfMonth(date);
          endDate = endOfMonth(date);
        } else if (currentView === 'week') {
          startDate = dateFnsStartOfWeek(date, { weekStartsOn: 1 });
          endDate = dateFnsEndOfWeek(date, { weekStartsOn: 1 });
        } else {
          startDate = startOfDay(date);
          endDate = endOfDay(date);
        }

        // Get the template's recurrence start and end dates
        const recurrenceStart = session.recurrence_start_date ? new Date(session.recurrence_start_date) : null;
        const recurrenceEnd = session.recurrence_end_date ? new Date(session.recurrence_end_date) : null;

        // Create events for each day in the range
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          // Skip if before recurrence start date
          if (recurrenceStart && currentDate < startOfDay(recurrenceStart)) {
            currentDate = addDays(currentDate, 1);
            continue;
          }

          // Skip if after recurrence end date
          if (recurrenceEnd && currentDate > startOfDay(recurrenceEnd)) {
            currentDate = addDays(currentDate, 1);
            continue;
          }

          // Get the day of week (0-6, where 0 is Sunday)
          const dayOfWeek = getDay(currentDate);
          // Convert to our format (0-6, where 0 is Sunday)
          const adjustedDayOfWeek = dayOfWeek;
          
          // Check if this day is in the schedule
          if (schedule.days.includes(mapIntToDayString(adjustedDayOfWeek, true))) {
            // Use schedule-specific duration if available, otherwise fall back to template default
            const effectiveDuration = schedule.duration_minutes || session.duration_minutes;

            // Create event in local time to match what the user sees
            const startTime = new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              currentDate.getDate(),
              hours,
              minutes,
              0,
              0
            );

            const endTime = new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              currentDate.getDate(),
              hours,
              minutes + effectiveDuration,
              0,
              0
            );

            events.push({
              id: `${session.id}-${schedule.id}-${format(currentDate, 'yyyy-MM-dd')}`,
              title: `${format(startTime, 'h:mm a')} – ${format(endTime, 'h:mm a')}: ${session.name}`,
              start: startTime,
              end: endTime,
              resource: session
            });
          }
          currentDate = addDays(currentDate, 1);
        }
      });
    }

    // Process one-off instances
    if (!session.is_recurring) {
      if (session.instances && session.instances.length > 0) {
        session.instances.forEach((instance) => {
          // Parse the ISO string and create a new Date object
          const startTime = new Date(instance.start_time);
          const endTime = new Date(instance.end_time);

          // Format the time in local timezone
          const formattedStartTime = format(startTime, 'h:mm a');
          const formattedEndTime = format(endTime, 'h:mm a');

          // Create events with the UTC times directly
          events.push({
            id: instance.id,
            title: `${formattedStartTime} – ${formattedEndTime}: ${session.name}`,
            start: startTime,
            end: endTime,
            resource: session
          });
        });
      } else if (session.one_off_dates && session.one_off_dates.length > 0) {
        // Fallback: render directly from one_off_dates (same approach as recurring from schedules)
        session.one_off_dates.forEach((d) => {
          const [hours, minutes] = d.time.split(':').map(Number)
          const startTime = new Date(d.date)
          startTime.setHours(hours, minutes, 0, 0)
          const effectiveDuration = d.duration_minutes ?? session.duration_minutes
          const endTime = new Date(startTime)
          endTime.setMinutes(endTime.getMinutes() + effectiveDuration)
          events.push({
            id: `${session.id}-${d.id}`,
            title: `${format(startTime, 'h:mm a')} – ${format(endTime, 'h:mm a')}: ${session.name}`,
            start: startTime,
            end: endTime,
            resource: session
          })
        })
      }
    }

    return events;
  });

  // Sort events by start time
  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Debug logging

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

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    onCreateSession(start, end)
  }

  const handleSelectEvent = (event: any) => {
    onEditSession(event.resource)
  }

  const navigatePeriod = (direction: 'prev' | 'next') => {
    switch (currentView) {
      case 'month':
        setDate(direction === 'prev' ? subMonths(date, 1) : addMonths(date, 1))
        break
      case 'week':
        setDate(direction === 'prev' ? subWeeks(date, 1) : addWeeks(date, 1))
        break
      case 'day':
        setDate(direction === 'prev' ? subDays(date, 1) : addDays(date, 1))
        break
    }
  }

  const goToToday = () => {
    setDate(new Date())
  }

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> off
      if (sortDirection === "asc") {
        setSortDirection("desc")
      } else if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  // Sort sessions based on current sort state
  const sortedSessions = useMemo(() => {
    if (!sortColumn || !sortDirection) return sessions

    return [...sessions].sort((a, b) => {
      let aVal: any
      let bVal: any

      switch (sortColumn) {
        case "name":
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case "capacity":
          aVal = a.capacity
          bVal = b.capacity
          break
        case "status":
          // Sort by visibility: open=2, hidden=1, closed=0
          const visOrder = { 'open': 2, 'hidden': 1, 'closed': 0 }
          aVal = visOrder[a.visibility ?? 'open'] ?? 2
          bVal = visOrder[b.visibility ?? 'open'] ?? 2
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
      return 0
    })
  }, [sessions, sortColumn, sortDirection])

  // Sortable column header component
  const SortableHeader = ({ column, children, className }: { column: SortColumn; children: React.ReactNode; className?: string }) => {
    const isActive = sortColumn === column
    return (
      <TableHead
        className={`cursor-pointer select-none hover:bg-muted/50 group ${className || ""}`}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive && sortDirection === "asc" && <ArrowUp className="h-3 w-3" />}
          {isActive && sortDirection === "desc" && <ArrowDown className="h-3 w-3" />}
          {!isActive && <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />}
        </div>
      </TableHead>
    )
  }

  // Custom components for the calendar
  const components: Components<CalendarEvent> = {
    toolbar: () => null,
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
    },
    event: CustomEvent
  }

  return (
    <div className="space-y-6">
      {view === "calendar" ? (
        <div>
          {/* Sticky toolbar */}
          <div className="sticky top-[65px] z-30 bg-white h-[75px] flex items-center px-8">
            <div className="flex items-center justify-between w-full">
              <div className="text-lg font-semibold">
                {format(date, 'MMMM yyyy')}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                >
                  Today
                </Button>
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
              selectable
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              view={currentView}
              onView={setCurrentView}
              date={date}
              onNavigate={setDate}
              step={30}
              timeslots={2}
              min={timeRange.min}
              max={timeRange.max}
              eventPropGetter={(event: CalendarEvent) => {
                const isFreeSession = event.resource.pricing_type === 'free'
                const customColor = event.resource.event_color

                // Calculate availability for full/sold out state
                const instance = event.resource.instances?.find(i => {
                  const instanceStart = new Date(i.start_time)
                  return instanceStart.getTime() === event.start.getTime()
                })
                const totalSpotsBooked = instance?.bookings?.reduce((sum, b) => sum + (b.number_of_spots || 1), 0) || 0
                const availableSpots = (event.resource.capacity || 10) - totalSpotsBooked
                const isFull = availableSpots === 0

                // Check visibility status
                const visibility = event.resource.visibility ?? 'open'
                const isHidden = visibility === 'hidden'
                const isClosed = visibility === 'closed'

                // Determine session type class
                // Priority: closed > hidden > free > full > default
                let typeClass = 'session-default'
                if (isClosed) {
                  typeClass = 'session-closed'
                } else if (isHidden) {
                  typeClass = 'session-hidden'
                } else if (isFreeSession) {
                  typeClass = 'session-free'
                } else if (isFull) {
                  typeClass = 'session-full'
                }

                // Build style object with custom color if provided (and not overridden by special states)
                const style: React.CSSProperties = {}
                if (customColor && !isFreeSession && !isFull && !isHidden && !isClosed) {
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
              defaultView="week"
            />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader column="name">Name</SortableHeader>
              <TableHead className="min-w-[200px]">Schedule</TableHead>
              <SortableHeader column="capacity">Capacity</SortableHeader>
              <SortableHeader column="status">Status</SortableHeader>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSessions.map((template) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    // Don't trigger if clicking on the action buttons
                    if ((e.target as HTMLElement).closest('button')) {
                      return;
                    }
                    onEditSession(template);
                  }}
                >
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell>
                    {template.is_recurring ? (
                      <div className="text-sm flex items-start gap-2">
                        <RefreshCw className="h-4 w-4 mt-1 flex-shrink-0" />
                        <div>
                          {template.schedules.map((schedule, idx) => {
                            const days = schedule.days.map(day => {
                              const shortDay = day.slice(0, 3).toLowerCase()
                              return shortDay.charAt(0).toUpperCase() + shortDay.slice(1)
                            }).join(', ')
                            const duration = schedule.duration_minutes ?? template.duration_minutes
                            return (
                              <div key={idx}>
                                {schedule.time} — {duration}min — {days}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : template.one_off_dates && template.one_off_dates.length > 0 ? (
                      <div className="text-sm flex items-start gap-2">
                        <Calendar className="h-4 w-4 mt-1 flex-shrink-0" />
                        <div>
                          {template.one_off_dates.map((d, idx) => {
                            const duration = d.duration_minutes ?? template.duration_minutes
                            return (
                              <div key={idx}>
                                {format(new Date(d.date + 'T00:00:00'), 'd MMM')} at {d.time.slice(0, 5)} — {duration}min
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      "No schedule"
                    )}
                  </TableCell>
                  <TableCell>{template.capacity}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        template.visibility === 'open' ? "success" :
                        template.visibility === 'hidden' ? "outline" :
                        "secondary"
                      }
                    >
                      {template.visibility === 'open' ? "Open" :
                       template.visibility === 'hidden' ? "Hidden" :
                       "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditSession(template);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      )}
    </div>
  )
}

// Export the ViewToggle component
CalendarView.Toggle = function ViewToggle() {
  const { view, setView } = useCalendarView()
  
  return (
    <div className="flex items-center space-x-2">
      <Button 
        variant={view === "list" ? "default" : "outline"} 
        size="icon" 
        onClick={() => setView("list")}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button 
        variant={view === "calendar" ? "default" : "outline"} 
        size="icon" 
        onClick={() => setView("calendar")}
      >
        <Calendar className="h-4 w-4" />
      </Button>
    </div>
  )
}
