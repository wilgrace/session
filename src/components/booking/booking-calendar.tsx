"use client"

import { useState, useEffect, useMemo } from "react"
import { Calendar as BigCalendar, momentLocalizer, View, Components, EventProps, Event } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/styles/calendar.css'
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from "date-fns"
import { SessionTemplate } from "@/types/session"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { useIsMobile } from "@/hooks/use-mobile"
import { MobileCalendarView } from "./mobile-calendar-view"
import { MobileSessionList } from "./mobile-session-list"
import { useUser } from "@clerk/nextjs"
import { Badge } from "@/components/ui/badge"
import { getInternalUserId } from "@/app/actions/session"

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

export function BookingCalendar({ sessions }: BookingCalendarProps) {
  const router = useRouter()
  const { user } = useUser()
  const isMobile = useIsMobile()
  const [currentView, setCurrentView] = useState<View>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [internalUserId, setInternalUserId] = useState<string | null>(null)

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

  // Convert sessions to events format for react-big-calendar
  // Memoize to prevent expensive recalculation on every render
  const events = useMemo(() => sessions.flatMap((template): CalendarEvent[] => {
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
                minutes + template.duration_minutes,
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
  }), [sessions, user?.id])

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
    let earliestStart = new Date(0, 0, 0, 23, 59, 59)
    let latestEnd = new Date(0, 0, 0, 0, 0, 0)

    events.forEach(event => {
      const startHour = event.start.getHours()
      const endHour = event.end.getHours()
      
      if (startHour < earliestStart.getHours()) {
        earliestStart = new Date(0, 0, 0, startHour, 0, 0)
      }
      if (endHour > latestEnd.getHours()) {
        latestEnd = new Date(0, 0, 0, endHour, 0, 0)
      }
    })

    // Add padding hours if needed
    const paddingHours = 2
    const minHour = Math.max(0, earliestStart.getHours() - paddingHours)
    const maxHour = Math.min(23, latestEnd.getHours() + paddingHours)

    return {
      min: new Date(0, 0, 0, minHour, 0, 0),
      max: new Date(0, 0, 0, maxHour, 0, 0)
    }
  }

  const timeRange = calculateTimeRange()

  const handleSelectEvent = (event: CalendarEvent) => {
    if (event.isBooked && event.bookingId) {
      // Only allow editing
      const queryParams = new URLSearchParams({
        start: event.start.toISOString(),
        edit: 'true',
        bookingId: event.bookingId
      });
      router.push(`/booking/${event.resource.id}?${queryParams.toString()}`)
      return
    }
    if (!event.isBooked) {
      // Only allow new booking if not already booked
      const queryParams = new URLSearchParams({
        start: event.start.toISOString()
      });
      router.push(`/booking/${event.resource.id}?${queryParams.toString()}`)
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
    event: CustomEvent
  }

  // For mobile view
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-none">
          <MobileCalendarView
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            sessions={sessions}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <MobileSessionList
            sessions={sessions}
            selectedDate={selectedDate}
          />
        </div>
      </div>
    )
  }

  // For desktop view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">
          {format(currentDate, 'MMMM yyyy')}
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
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          onSelectEvent={handleSelectEvent}
          view={currentView}
          onView={setCurrentView}
          date={currentDate}
          onNavigate={setCurrentDate}
          step={30}
          timeslots={2}
          min={timeRange.min}
          max={timeRange.max}
          eventPropGetter={(event: CalendarEvent) => ({
            className: `cursor-pointer !p-0 ${event.isBooked ? 'booked-session' : ''}`,
            style: {
              backgroundColor: event.isBooked ? '#dcfce7' : 'white',
              color: event.isBooked ? '#166534' : '#111827',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: event.isBooked ? '#86efac' : '#e5e7eb',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              borderRadius: '0.375rem',
              '&:hover': {
                backgroundColor: event.isBooked ? '#bbf7d0' : '#f3f4f6'
              }
            }
          })}
          components={components}
        />
      </div>
    </div>
  )
} 