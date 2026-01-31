"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { List, ChevronLeft, ChevronRight, Calendar, ChevronDown, RefreshCw, Trash2, Pencil } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfWeek as dateFnsStartOfWeek, endOfWeek as dateFnsEndOfWeek, startOfDay, endOfDay, getDay } from "date-fns"
import { SessionTemplate } from "@/types/session"
import { cn } from "@/lib/utils"
import { useCalendarView } from "@/hooks/use-calendar-view"
import { Calendar as BigCalendar, momentLocalizer, View, Components, EventProps, Event } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/styles/calendar.css'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { mapIntToDayString } from "@/lib/day-utils"

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

// Add this before the CalendarView component
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

  const getAvailabilityColor = (available: number, total: number) => {
    if (available === 0) return "bg-gray-500"
    const percentage = (available / total) * 100
    if (percentage > 50) return "bg-green-500"
    if (percentage > 25) return "bg-yellow-500"
    return "bg-red-500"
  }

  return (
    <div className="flex flex-col gap-1 p-1">
      <div className="text-xs text-gray-500">
        {format(event.start, 'HH:mm')} - {event.resource.duration_minutes}mins
      </div>
      <div className="font-medium">
        {event.resource.name}
      </div>
      <Badge 
        variant="secondary" 
        className={`${getAvailabilityColor(availableSpots, totalCapacity)} text-white px-2 py-0.5 rounded-full text-xs`}
      >
        {availableSpots === 0 ? 'Sold out' : `${totalSpotsBooked}/${totalCapacity}`}
      </Badge>
    </div>
  )
}

export function CalendarView({ sessions, onEditSession, onCreateSession, onDeleteSession, showControls = true }: CalendarViewProps) {
  const { view, setView, date, setDate } = useCalendarView()
  const [currentView, setCurrentView] = useState<View>('week')
  const [isMobile, setIsMobile] = useState(false)

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
              minutes + session.duration_minutes,
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
      if (session.instances) {
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
      } else if (session.one_off_date && session.one_off_start_time) {
        // Handle one-off sessions without instances
        const [hours, minutes] = session.one_off_start_time.split(':').map(Number);
        const startTime = new Date(session.one_off_date);
        startTime.setHours(hours, minutes, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + session.duration_minutes);

        // Format the time in local timezone
        const formattedStartTime = format(startTime, 'h:mm a');
        const formattedEndTime = format(endTime, 'h:mm a');

        events.push({
          id: `${session.id}-one-off`,
          title: `${formattedStartTime} – ${formattedEndTime}: ${session.name}`,
          start: startTime,
          end: endTime,
          resource: session
        });
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

  // Custom components for the calendar
  const components: Components<CalendarEvent> = {
    toolbar: () => null,
    header: ({ date, label }) => {
      if (currentView === 'month') {
        return <div className="rbc-header">{label}</div>
      }
      if (currentView === 'day') {
        return (
          <div className="rbc-header">
            <div className="text-lg font-semibold mb-2">{format(date, 'EEEE, MMMM d, yyyy')}</div>
            {label}
          </div>
        )
      }
      return <div className="rbc-header">{label}</div>
    },
    event: CustomEvent
  }

  return (
    <div className="space-y-6">
      {view === "calendar" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">
              {format(date, 'MMMM yyyy')}
            </div>
            <div className="flex items-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setCurrentView('month')}>
                    Month
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCurrentView('week')}>
                    Week
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCurrentView('day')}>
                    Day
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
          <div className="h-[600px] border rounded-lg">
            <BigCalendar
              localizer={localizer}
              formats={calendarFormats}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
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
              eventPropGetter={(event: CalendarEvent) => ({
                className: 'cursor-pointer !p-0',
                style: {
                  backgroundColor: 'white',
                  color: '#111827',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: '#e5e7eb',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  borderRadius: '0.375rem',
                  '&:hover': {
                    backgroundColor: '#f3f4f6'
                  }
                }
              })}
              components={components}
              defaultView="week"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((template) => (
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
                            return (
                              <div key={idx}>
                                {schedule.time} {days}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : template.one_off_date && template.one_off_start_time ? (
                      <div className="text-sm flex items-start gap-2">
                        <Calendar className="h-4 w-4 mt-1 flex-shrink-0" />
                        <div>
                          {format(new Date(`${template.one_off_date}T${template.one_off_start_time}`), 'd MMM')} at {format(new Date(`${template.one_off_date}T${template.one_off_start_time}`), 'HH:mm')}
                        </div>
                      </div>
                    ) : template.instances && template.instances.length > 0 ? (
                      <div className="text-sm flex items-start gap-2">
                        <Calendar className="h-4 w-4 mt-1 flex-shrink-0" />
                        <div>
                          {template.instances.map((instance, idx) => (
                            <div key={idx}>
                              {format(new Date(instance.start_time), 'd MMM')} at {format(new Date(instance.start_time), 'HH:mm')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      "No schedule"
                    )}
                  </TableCell>
                  <TableCell>{template.duration_minutes} minutes</TableCell>
                  <TableCell>{template.capacity}</TableCell>
                  <TableCell>
                    <Badge variant={template.is_open ? "success" : "secondary"}>
                      {template.is_open ? "Open" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive/90 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          // We'll need to add a delete handler prop to the component
                          if (onDeleteSession) {
                            onDeleteSession(template);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
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
        </div>
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
