'use client';

import * as React from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
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
  // Show 4 days on mobile, 7 on desktop
  const visibleDays = isMobile ? days.slice(0, 4) : days;

  return (
    <div className="w-full flex items-stretch border-b bg-background">
      <div className="flex flex-col justify-center">
        <button
          className="p-2 rounded hover:bg-muted transition shrink-0"
          onClick={onPrev}
          aria-label="Previous days"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="flex flex-1 gap-2">
        {visibleDays.map((date) => {
          const key = format(date, 'yyyy-MM-dd');
          const isToday = isSameDay(date, new Date());
          const isSelected = isSameDay(date, selectedDay);
          const sessions = sessionsByDay[key] || [];
          return (
            <div
              key={key}
              className={cn(
                'flex flex-col items-stretch px-2 py-2 transition-all bg-white flex-1',
                isSelected && 'ring-2 ring-primary bg-primary/10',
                isToday && !isSelected && 'bg-blue-50',
                !isSelected && !isToday && 'border-gray-200',
                'hover:bg-primary/5 cursor-pointer'
              )}
              onClick={() => onSelectDay(date)}
            >
              <div className="flex flex-col items-center mb-2">
                <span className="text-xs font-medium">{format(date, 'EEE')}</span>
                <span className="text-sm">{format(date, 'd MMM')}</span>
              </div>
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
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "flex items-center justify-between border rounded px-2 py-1 text-xs cursor-pointer transition-colors",
                          isActiveSession
                            ? "bg-primary text-primary-foreground border-primary"
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
            </div>
          );
        })}
      </div>
      <div className="flex flex-col justify-center">
        <button
          className="p-2 rounded hover:bg-muted transition shrink-0"
          onClick={onNext}
          aria-label="Next days"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
} 