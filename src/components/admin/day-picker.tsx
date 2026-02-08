'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

type DayPickerProps = {
  days: Date[];
  selectedDay: Date;
  onSelectDay: (date: Date) => void;
  isCollapsed: boolean;
  onCollapseToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  sessionsByDay: Record<string, any[]>; // { '2024-06-01': [session, ...] }
  selectedSessionId?: string | null;
  onSelectSession?: (session: any) => void;
};

export function DayPicker({
  days,
  selectedDay,
  onSelectDay,
  isCollapsed,
  onCollapseToggle,
  onPrev,
  onNext,
  sessionsByDay = {},
  selectedSessionId,
  onSelectSession,
}: DayPickerProps) {
  const isMobile = useIsMobile();
  // Show 3 days on mobile, 7 on desktop
  const visibleDays = isMobile ? days.slice(0, 3) : days;
  const now = new Date();

  return (
    <div className="w-full border-b bg-background mt-1">
      <div className="flex items-stretch">
        <button
          className="p-2 rounded hover:bg-muted transition shrink-0 flex items-center"
          onClick={onPrev}
          aria-label="Previous days"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {visibleDays.map((date) => {
          const key = format(date, 'yyyy-MM-dd');
          const isToday = isSameDay(date, now);
          const isSelected = isSameDay(date, selectedDay);
          const sessions = sessionsByDay[key] || [];
          return (
            <div
              key={key}
              className={cn(
                'flex flex-col items-stretch px-2 py-2 transition-all bg-white flex-1',
                isSelected && 'border border-primary bg-primary/10',
                isToday && !isSelected && 'bg-blue-50',
                !isSelected && !isToday && 'border-gray-200',
                'hover:bg-primary/5 cursor-pointer'
              )}
              onClick={() => onSelectDay(date)}
            >
              <div className="flex flex-col items-center mb-2">
                <span className="text-xs font-medium">{format(date, 'EEE')}</span>
                {isToday ? (
                  <span className="text-sm font-semibold text-primary">TODAY</span>
                ) : (
                  <span className="text-sm">{format(date, 'd MMM')}</span>
                )}
              </div>
              {!isCollapsed && (
                <div className="flex flex-col gap-1">
                  {sessions.length === 0 ? (
                    <span className="text-xs text-muted-foreground text-center">No sessions</span>
                  ) : (
                    sessions.map((session: any) => {
                      let time = '--:--';
                      if (session.start_time) {
                        const dateObj = new Date(session.start_time);
                        if (!isNaN(dateObj.getTime())) {
                          time = format(dateObj, 'HH:mm');
                        }
                      }
                      const spotsTaken = (session.bookings || []).reduce(
                        (sum: number, b: any) => sum + (b.number_of_spots || 1),
                        0
                      );
                      const isActiveSession = selectedSessionId === session.id;
                      const isPast = session.end_time
                        ? new Date(session.end_time).getTime() < now.getTime()
                        : new Date(session.start_time).getTime() < now.getTime();
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "flex items-center justify-between border rounded px-2 py-1 text-xs cursor-pointer transition-colors",
                            isActiveSession
                              ? "bg-primary text-primary-foreground border-primary"
                              : isPast
                                ? "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
                                : "bg-blue-50 hover:bg-blue-100"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDay(date);
                            onSelectSession?.(session);
                          }}
                        >
                          <span className="font-bold">{time}</span>
                          <span>{spotsTaken}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          className="p-2 rounded hover:bg-muted transition shrink-0 flex items-center"
          onClick={onNext}
          aria-label="Next days"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <button
        className="flex items-center justify-center w-full py-1 hover:bg-muted/50 transition"
        onClick={onCollapseToggle}
        aria-label={isCollapsed ? "Show sessions" : "Hide sessions"}
      >
        {isCollapsed ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
