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
} from "date-fns"
import { SessionTemplate } from "@/types/session"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getEventColorValues } from "@/lib/event-colors"
import { SAUNA_TIMEZONE, formatLocalDate } from "@/lib/time-utils"
import { SessionFilter } from "./session-filter"
import type { PriceOption, Membership } from "@/lib/db/schema"

interface MobileCalendarViewProps {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  sessions: SessionTemplate[]
  allSessions: SessionTemplate[]
  selectedTemplateIds: string[]
  onFilterChange: (ids: string[]) => void
  filterablePriceOptions?: PriceOption[]
  selectedPriceOptionIds?: string[]
  onPriceOptionSelectionChange?: (ids: string[]) => void
  filterableMemberships?: Membership[]
  selectedMembershipIds?: string[]
  onMembershipSelectionChange?: (ids: string[]) => void
}

export function MobileCalendarView({ selectedDate, onDateSelect, sessions, allSessions, selectedTemplateIds, onFilterChange, filterablePriceOptions, selectedPriceOptionIds, onPriceOptionSelectionChange, filterableMemberships, selectedMembershipIds, onMembershipSelectionChange }: MobileCalendarViewProps) {
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

  const isSessionFullOnDay = (template: SessionTemplate, day: Date) => {
    if (!template.instances) return false
    const dateStr = format(day, 'yyyy-MM-dd')
    const instancesOnDay = template.instances.filter(inst =>
      formatLocalDate(new Date(inst.start_time), SAUNA_TIMEZONE) === dateStr
    )
    if (instancesOnDay.length === 0) return false
    const totalCapacity = template.capacity || 10
    return instancesOnDay.every(instance => {
      const totalSpotsBooked = instance.bookings?.reduce((sum: number, b: { number_of_spots?: number }) => sum + (b.number_of_spots || 1), 0) || 0
      return totalSpotsBooked >= totalCapacity
    })
  }

  const getSessionsForDay = (day: Date) => {
    return sessions.filter((template) => {
      if (template.instances && template.instances.length > 0) {
        // Template has instances — only show if there's an instance on this specific day
        return template.instances.some(instance =>
          formatLocalDate(new Date(instance.start_time), SAUNA_TIMEZONE) === format(day, 'yyyy-MM-dd')
        )
      }
      // No instances yet — fall back to schedule-based check
      if ((template.schedules?.length ?? 0) > 0 && template.schedules) {
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

  const handlePrevWeek = () => setWeekOffset(prev => Math.max(0, prev - 3))
  const handleNextWeek = () => setWeekOffset(prev => prev + 3)

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
      <div className="flex items-center gap-2 p-4 border-b">
        <h2 className="flex-1 text-2xl font-bold">
          {isSameMonth(windowStart, windowEnd)
            ? format(windowStart, 'MMMM')
            : `${format(windowStart, 'MMM')} – ${format(windowEnd, 'MMM')}`}
        </h2>
        <SessionFilter
          sessions={allSessions}
          selectedIds={selectedTemplateIds}
          onSelectionChange={onFilterChange}
          filterablePriceOptions={filterablePriceOptions}
          selectedPriceOptionIds={selectedPriceOptionIds}
          onPriceOptionSelectionChange={onPriceOptionSelectionChange}
          filterableMemberships={filterableMemberships}
          selectedMembershipIds={selectedMembershipIds}
          onMembershipSelectionChange={onMembershipSelectionChange}
        />
        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handlePrevWeek}
            disabled={weekOffset === 0}
            className="h-9 w-9 rounded-r-none border-r-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleNextWeek}
            className="h-9 w-9 rounded-l-none"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
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
          const daySessions = getSessionsForDay(day)
          // Disable future days that have no sessions (like past days)
          const isDisabled = isPastDay || (!isToday(day) && daySessions.length === 0)
          // Show month label on the 1st, but not when it's the very first cell
          // (already clear from the header)
          const displaySessions = daySessions.slice(0, 4)

          return (
            <div key={i} className="p-2">
              <button
                type="button"
                className={`aspect-square w-full flex flex-col items-center justify-center rounded-full ${
                  isSelected ? "text-white" :
                  isDisabled ? "text-gray-400" :
                  "hover:bg-gray-100"
                }`}
                style={isSelected ? { backgroundColor: 'hsl(var(--primary))' } : undefined}
                onClick={() => !isDisabled && onDateSelect(day)}
                disabled={isDisabled}
              >
                <span className="text-lg leading-none">{format(day, "d")}</span>
                {displaySessions.length > 0 && !isSelected && !isDisabled ? (
                  <div className="flex justify-center space-x-0.5 mt-0.5">
                    {displaySessions.map((session, index) => (
                      <div
                        key={index}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: isSessionFullOnDay(session, day) ? '#FFF' : getEventColorValues(session.event_color).color500 }}
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
