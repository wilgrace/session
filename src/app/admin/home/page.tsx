"use client";

import { useState, useMemo, useCallback } from 'react';
import { DayPicker } from '@/components/admin/day-picker';
import { useSessions } from '@/hooks/use-sessions';
import { addDays, startOfDay, format, isSameDay, endOfDay } from 'date-fns';
import { SessionDetails } from '@/components/admin/session-details';
import { BookingsList } from '@/components/admin/bookings-list';
import { BookingDetailsPanel } from '@/components/admin/booking-details-panel';
import { useIsMobile } from '@/hooks/use-mobile';
// import { UserButton } from "@clerk/nextjs"; // Uncomment and use in your header if needed

const NUM_DAYS = 14;

export default function AdminHomePage() {
  const today = startOfDay(new Date());
  const [dayOffset, setDayOffset] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const isMobile = useIsMobile();

  // Generate visible days
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, dayOffset + i));

  // Fetch sessions for the visible range
  const { sessions: rawSessions } = useSessions(days[0], endOfDay(days[days.length - 1]));
  const sessions = rawSessions ?? [];

  // Debug logging
  console.log('Selected day:', selectedDay);
  console.log('Sessions returned:', sessions);
  sessions.forEach((s) => {
    console.log('Session:', s.id, 'startTime:', (s as any).start_time, 'as date:', (s as any).start_time ? new Date((s as any).start_time) : null);
  });

  // Map: date string -> array of sessions (group by local day)
  const sessionsByDay: Record<string, any[]> = {};
  sessions.forEach((s) => {
    if ((s as any).start_time) {
      const dateObj = new Date((s as any).start_time);
      if (!isNaN(dateObj.getTime())) {
        // Use local midnight for grouping
        const localMidnight = new Date(
          dateObj.getFullYear(),
          dateObj.getMonth(),
          dateObj.getDate()
        );
        const key = format(localMidnight, 'yyyy-MM-dd');
        if (!sessionsByDay[key]) sessionsByDay[key] = [];
        sessionsByDay[key].push(s);
      }
    }
  });

  // Find sessions for the selected day
  const selectedDayKey = format(selectedDay, 'yyyy-MM-dd');
  const sessionsForDay = sessionsByDay[selectedDayKey] || [];
  // Pick the next session (first by time)
  const nextSession = useMemo(() => {
    if (!sessionsForDay.length) return null;
    // Sort by start_time ascending
    return [...sessionsForDay].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
  }, [sessionsForDay]);

  // Handler for check-in (to be implemented)
  const handleCheckIn = useCallback((bookingId: string) => {
    // TODO: Implement check-in logic
    console.log('Check in booking:', bookingId);
  }, []);

  return (
    <main className="flex-1 flex flex-col">
      <DayPicker
        days={days}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        isCollapsed={isCollapsed}
        onCollapseToggle={() => setIsCollapsed((v) => !v)}
        onPrev={() => setDayOffset((o) => Math.max(0, o - 7))}
        onNext={() => setDayOffset((o) => Math.min(NUM_DAYS - 7, o + 7))}
        sessionsByDay={sessionsByDay}
      />
      <div className="flex-1 flex">

        <div className={selectedBooking && !isMobile ? 'border-r border-gray-200 flex-1' : ' flex-1 border-gray-200'}>
          {nextSession ? (
            <>
              <SessionDetails session={nextSession} />
              <div className="p-6">
                <BookingsList
                  bookings={nextSession.bookings || []}
                  onCheckIn={handleCheckIn}
                  onSelect={setSelectedBooking}
                />
              </div>
            </>
          ) : (
            <div className="text-muted-foreground text-center py-12">No sessions for this day.</div>
          )}
        </div>  
        {/* Booking Details Panel */}
        {selectedBooking && !isMobile && (
          <div className="w-full lg:w-96">
            <BookingDetailsPanel
              booking={selectedBooking}
              onClose={() => setSelectedBooking(null)}
              onEdit={() => {}}
              onCheckIn={() => {}}
            />
          </div>
        )}
      </div>
      {/* Mobile overlay */}
      {selectedBooking && isMobile && (
        <div className="w-full lg:w-96 absolute inset-0 bg-background z-50">
          <BookingDetailsPanel
            booking={selectedBooking}
            onClose={() => setSelectedBooking(null)}
            onEdit={() => {}}
            onCheckIn={() => {}}
          />
        </div>
      )}
    </main>
  );
} 