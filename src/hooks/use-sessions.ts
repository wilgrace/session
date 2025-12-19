import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SessionInstanceWithBookings } from '@/lib/db/queries';
import { getSessionInstancesForDateRange } from '@/lib/db/queries';

export function useSessions(startDate: Date, endDate: Date) {
  const [sessions, setSessions] = useState<SessionInstanceWithBookings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Initial fetch
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const data = await getSessionInstancesForDateRange(startDate, endDate);
        if (isMounted) {
          setSessions(data ?? []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch sessions'));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSessions();

    // Set up real-time subscriptions
    const sessionChannel = supabase
      .channel('session-instances-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_instances',
        },
        fetchSessions
      )
      .subscribe();

    const bookingChannel = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        fetchSessions
      )
      .subscribe();

    // Cleanup subscriptions and prevent state updates after unmount
    return () => {
      isMounted = false;
      sessionChannel.unsubscribe();
      bookingChannel.unsubscribe();
    };
  }, [startDate.getTime(), endDate.getTime()]);

  return { sessions, loading, error };
} 