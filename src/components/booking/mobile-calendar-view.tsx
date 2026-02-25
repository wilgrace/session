"use client"

import { useState, useEffect, useRef } from "react"
import {
  format,
  addDays,
  startOfWeek,
  startOfDay,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isPast,
  isToday,
  getDate,
} from "date-fns"
import { SessionTemplate } from "@/types/session"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getEventColorValues } from "@/lib/event-colors"
import { SAUNA_TIMEZONE, formatLocalDate } from "@/lib/time-utils"

interface MobileCalendarViewProps {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  sessions: SessionTemplate[]
}

export function MobileCalendarView({ selectedDate, onDateSelect, sessions }: MobileCalendarViewProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const touchStartX = useRef(0)

  // Sync weekOffset when selectedDate moves outside the current 3-week window
  useEffect(() => {
    const todayMonday = startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 })
    setWeekOffset(prev => {
      const windowStart = addDays(todayMonday, prev * 7)
      const windowEnd = addDays(windowStart, 20)
      const sel = startOfDay(selectedDate)
      if (sel >= windowStart && sel <= windowEnd) return prev
      const daysDiff = Math.floor((sel.getTime() - todayMonday.getTime()) / 86400000)
      return Math.max(0, Math.floor(daysDiff / 7))
    })
  }, [selectedDate])

  const todayMonday = startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 })
  const windowStart = addDays(todayMonday, weekOffset * 7)
  const windowEnd = addDays(windowStart, 20)
  const days = eachDayOfInterval({ start: windowStart, end: windowEnd })

  const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

  const getSessionsForDay = (day: Date) => {
    return sessions.filter((template) => {
      if (template.instances) {
        const hasInstance = template.instances.some(instance =>
          formatLocalDate(new Date(instance.start_time), SAUNA_TIMEZONE) === format(day, 'yyyy-MM-dd')
        )
        if (hasInstance) return true
        // No instance found for this day — fall through to recurring schedule check
      }
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

  const handlePrevWeek = () => setWeekOffset(prev => Math.max(0, prev - 1))
  const handleNextWeek = () => setWeekOffset(prev => prev + 1)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 50) {
      delta > 0 ? handleNextWeek() : handlePrevWeek()
    }
  }

  return (
    <div className="bg-white pb-4 border-b">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handlePrevWeek}
          disabled={weekOffset === 0}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold">
          {isSameMonth(windowStart, windowEnd) ? (
            <>
              {format(windowStart, 'MMMM')} <span className="text-primary">{format(windowStart, 'yyyy')}</span>
            </>
          ) : (
            <>
              {format(windowStart, 'MMM')} – {format(windowEnd, 'MMM')} <span className="text-primary">{format(windowEnd, 'yyyy')}</span>
            </>
          )}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleNextWeek}
          className="h-8 w-8"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 text-center text-xs font-medium py-2">
        {dayNames.map((day, i) => (
          <div key={i} className="py-1">{day}</div>
        ))}
      </div>

      {/* Calendar grid — always 21 cells (3 rows × 7), always starts on Monday */}
      <div
        className="grid grid-cols-7 text-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate)
          const isPastDay = isPast(day) && !isToday(day)
          // Show month label on the 1st, but not when it's the very first cell
          // (already clear from the header)
          const isMonthStart = getDate(day) === 1 && i > 0
          const daySessions = getSessionsForDay(day)
          const displaySessions = daySessions.slice(0, 4)

          return (
            <div key={i} className="p-2">
              <button
                type="button"
                className={`aspect-square w-full flex flex-col items-center justify-center rounded-full ${
                  isSelected ? "text-white" :
                  isPastDay ? "text-gray-400" :
                  "hover:bg-gray-100"
                }`}
                style={isSelected ? { backgroundColor: 'hsl(var(--primary))' } : undefined}
                onClick={() => !isPastDay && onDateSelect(day)}
                disabled={isPastDay}
              >
                <span className="text-lg leading-none">{format(day, "d")}</span>
                {isMonthStart ? (
                  <span className="text-[9px] leading-none mt-0.5 opacity-70">{format(day, 'MMM')}</span>
                ) : displaySessions.length > 0 && !isSelected && !isPastDay ? (
                  <div className="flex justify-center space-x-0.5 mt-0.5">
                    {displaySessions.map((session, index) => (
                      <div
                        key={index}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: getEventColorValues(session.event_color).color500 }}
                      />
                    ))}
                  </div>
                ) : null}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
