import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SessionInstanceWithBookings } from '@/lib/db/queries';
import { getAdminSessionsForDateRange } from '@/app/actions/session';

export function useSessions(startDate: Date, endDate: Date, organizationId?: string) {
  const [sessions, setSessions] = useState<SessionInstanceWithBookings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Initial fetch using server action
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const result = await getAdminSessionsForDateRange(
          startDate.toISOString(),
          endDate.toISOString(),
          organizationId
        );
        if (isMounted) {
          if (result.success) {
            setSessions((result.data as SessionInstanceWithBookings[]) ?? []);
            setError(null);
          } else {
            setError(new Error(result.error || 'Failed to fetch sessions'));
          }
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
  }, [startDate.getTime(), endDate.getTime(), organizationId]);

  return { sessions, loading, error };
} 