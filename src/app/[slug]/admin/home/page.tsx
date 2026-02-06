"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { DayPicker } from '@/components/admin/day-picker';
import { useSessions } from '@/hooks/use-sessions';
import { addDays, startOfDay, format, endOfDay } from 'date-fns';
import { SessionDetails } from '@/components/admin/session-details';
import { BookingsList } from '@/components/admin/bookings-list';
import { BookingDetailsPanel } from '@/components/admin/booking-details-panel';
import { BookingsListView } from '@/components/admin/bookings-list-view';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBookingsView } from '@/hooks/use-bookings-view';

const NUM_DAYS = 14;

export default function AdminHomePage() {
  const [today] = useState(() => startOfDay(new Date()));
  const [dayOffset, setDayOffset] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const isMobile = useIsMobile();
  const { view, searchQuery, setView, setSearchQuery } = useBookingsView();

  // Auto-switch to list view when search is active
  useEffect(() => {
    if (searchQuery && view === "calendar") {
      setView("list");
    }
  }, [searchQuery, view, setView]);

  // Generate visible days - memoized to prevent infinite re-fetching
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(today, dayOffset + i)),
    [today, dayOffset]
  );

  // Memoize date range for useSessions
  const startDate = useMemo(() => days[0], [days]);
  const endDate = useMemo(() => endOfDay(days[days.length - 1]), [days]);

  // Fetch sessions for the visible range
  const { sessions: rawSessions } = useSessions(startDate, endDate);
  const sessions = rawSessions ?? [];

  // Map: date string -> array of sessions (group by local day) - memoized
  const sessionsByDay = useMemo(() => {
    const result: Record<string, any[]> = {};
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
          if (!result[key]) result[key] = [];
          result[key].push(s);
        }
      }
    });
    return result;
  }, [sessions]);

  // Find sessions for the selected day
  const selectedDayKey = format(selectedDay, 'yyyy-MM-dd');
  const sessionsForDay = useMemo(() => {
    const daySessions = sessionsByDay[selectedDayKey] || [];
    // Sort by start_time ascending
    return [...daySessions].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [sessionsByDay, selectedDayKey]);

  // Get the currently selected session
  const currentSession = useMemo(() => {
    if (!sessionsForDay.length) return null;
    // Clamp index to valid range
    const index = Math.min(selectedSessionIndex, sessionsForDay.length - 1);
    return sessionsForDay[index] || null;
  }, [sessionsForDay, selectedSessionIndex]);

  // Reset session index when day changes
  const handleSelectDay = useCallback((date: Date) => {
    setSelectedDay(date);
    setSelectedSessionIndex(0);
    setSelectedBooking(null);
  }, []);

  // Handle session selection from calendar
  const handleSelectSession = useCallback((session: any) => {
    const index = sessionsForDay.findIndex((s: any) => s.id === session.id);
    if (index !== -1) {
      setSelectedSessionIndex(index);
      setSelectedBooking(null);
    }
  }, [sessionsForDay]);

  // Handler for check-in notification (called after check-in completes)
  const handleCheckIn = useCallback((bookingId: string, newStatus: 'confirmed' | 'completed') => {
    // Update selectedBooking if it's the one that was checked in
    if (selectedBooking && selectedBooking.id === bookingId) {
      setSelectedBooking((prev: any) => prev ? { ...prev, status: newStatus } : null);
    }
  }, [selectedBooking]);

  // Render List View
  if (view === "list") {
    return (
      <main className="flex-1 flex flex-col">
        <div className="flex-1 flex">
          <div className={selectedBooking && !isMobile ? 'border-r border-gray-200 flex-1' : 'flex-1 border-gray-200'}>
            <BookingsListView
              searchQuery={searchQuery}
              onSelectBooking={setSelectedBooking}
              onClearSearch={() => setSearchQuery("")}
            />
          </div>
          {/* Booking Details Panel */}
          {selectedBooking && !isMobile && (
            <div className="w-full lg:w-96">
              <BookingDetailsPanel
                booking={selectedBooking}
                onClose={() => setSelectedBooking(null)}
                onEdit={() => {}}
                onCheckIn={handleCheckIn}
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
              onCheckIn={handleCheckIn}
            />
          </div>
        )}
      </main>
    );
  }

  // Render Calendar View (default)
  return (
    <main className="flex-1 flex flex-col">
      <DayPicker
        days={days}
        selectedDay={selectedDay}
        onSelectDay={handleSelectDay}
        isCollapsed={isCollapsed}
        onCollapseToggle={() => setIsCollapsed((v) => !v)}
        onPrev={() => setDayOffset((o) => Math.max(0, o - 7))}
        onNext={() => setDayOffset((o) => Math.min(NUM_DAYS - 7, o + 7))}
        sessionsByDay={sessionsByDay}
        selectedSessionId={currentSession?.id}
        onSelectSession={handleSelectSession}
      />
      <div className="flex-1 flex">

        <div className={selectedBooking && !isMobile ? 'border-r border-gray-200 flex-1' : ' flex-1 border-gray-200'}>
          {currentSession ? (
            <>
              <SessionDetails
                session={currentSession}
                currentIndex={selectedSessionIndex}
                totalSessions={sessionsForDay.length}
                onPrevSession={() => {
                  setSelectedSessionIndex((i) => Math.max(0, i - 1));
                  setSelectedBooking(null);
                }}
                onNextSession={() => {
                  setSelectedSessionIndex((i) => Math.min(sessionsForDay.length - 1, i + 1));
                  setSelectedBooking(null);
                }}
              />
              <div className="p-6">
                <BookingsList
                  bookings={currentSession.bookings || []}
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
              onCheckIn={handleCheckIn}
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
            onCheckIn={handleCheckIn}
          />
        </div>
      )}
    </main>
  );
}
