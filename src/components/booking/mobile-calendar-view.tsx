"use client"

import { useState, useEffect } from "react"
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isPast,
  isToday,
} from "date-fns"
import { SessionTemplate } from "@/types/session"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getEventColorValues } from "@/lib/event-colors"

interface MobileCalendarViewProps {
  currentDate: Date
  selectedDate: Date
  onDateSelect: (date: Date) => void
  sessions: SessionTemplate[]
}

export function MobileCalendarView({ currentDate, selectedDate, onDateSelect, sessions }: MobileCalendarViewProps) {
  const router = useRouter()
  const [viewDate, setViewDate] = useState(currentDate)

  // Only update viewDate when selectedDate changes to a different month
  // and when it's not already in the same month as viewDate
  useEffect(() => {
    if (!isSameMonth(selectedDate, viewDate)) {
      setViewDate(selectedDate)
    }
  }, [selectedDate])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get the day names for the header
  const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

  // Get sessions for a specific day
  const getSessionsForDay = (day: Date) => {
    return sessions.filter((template) => {
      // Check if any instance matches this day
      if (template.instances) {
        return template.instances.some(instance => 
          isSameDay(new Date(instance.start_time), day)
        )
      }
      
      // Check if any recurring schedule matches this day
      if (template.is_recurring && template.schedules) {
        const dayName = format(day, 'EEEE').toLowerCase()
        return template.schedules.some(schedule => 
          schedule.days.some(scheduleDay => 
            scheduleDay.toLowerCase() === dayName
          )
        )
      }
      
      return false
    })
  }

  // Generate color dots for sessions
  const renderSessionDots = (day: Date) => {
    const daySessions = getSessionsForDay(day)
    if (daySessions.length === 0) return null

    // Limit to 4 dots
    const displaySessions = daySessions.slice(0, 4)

    return (
      <div className="flex justify-center mt-1 space-x-0.5">
        {displaySessions.map((session, index) => (
          <div key={index} className="h-1.5 w-1.5 rounded-full bg-primary" />
        ))}
      </div>
    )
  }

  const handleDayClick = (day: Date) => {
    onDateSelect(day)
  }

  const handlePrevMonth = () => {
    setViewDate(prev => subMonths(prev, 1))
  }

  const handleNextMonth = () => {
    setViewDate(prev => addMonths(prev, 1))
  }

  return (
    <div className="bg-white rounded-lg shadow-sm sticky top-0 z-10">
      {/* Month title */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handlePrevMonth}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold">
          <span>
            {format(viewDate, "MMMM")} <span className="text-primary">{format(viewDate, "yyyy")}</span>
          </span>
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleNextMonth}
          className="h-8 w-8"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 text-center text-xs font-medium py-2">
        {dayNames.map((day, i) => (
          <div key={i} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 text-center">
        {daysInMonth.map((day, i) => {
          // Adjust the index to start from Monday (1) instead of Sunday (0)
          const dayOfWeek = day.getDay() === 0 ? 6 : day.getDay() - 1

          // If it's the first day of the month, add appropriate spacing
          const startSpacing = i === 0 ? `col-start-${dayOfWeek + 1}` : ""

          const isSelected = isSameDay(day, selectedDate)
          const isCurrentMonth = isSameMonth(day, viewDate)
          const isPastDay = isPast(day) && !isToday(day)
          const daySessions = getSessionsForDay(day)
          const displaySessions = daySessions.slice(0, 4)

          return (
            <div key={i} className={`p-2 ${startSpacing} ${!isCurrentMonth ? "text-gray-400" : ""}`}>
              <button
                type="button"
                className={`aspect-square w-full flex flex-col items-center justify-center rounded-full ${
                  isSelected ? "text-white" :
                  isPastDay ? "text-gray-400" :
                  "hover:bg-gray-100"
                }`}
                style={isSelected ? { backgroundColor: 'hsl(var(--primary))' } : undefined}
                onClick={() => !isPastDay && handleDayClick(day)}
                disabled={isPastDay}
              >
                <span className="text-lg mb-1">{format(day, "d")}</span>
                {displaySessions.length > 0 && (
                  <div className="flex justify-center space-x-0.5">
                    {displaySessions.map((session, index) => (
                      <div
                        key={index}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: isSelected
                            ? 'white'
                            : getEventColorValues(session.event_color).color500,
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
} 