import { and, eq, gte, lte } from 'drizzle-orm';
import { createSupabaseServerClient } from '@/lib/supabase';
import { bookings, clerkUsers, sessionInstances, sessionTemplates } from './schema';

export type SessionInstanceWithBookings = typeof sessionInstances.$inferSelect & {
  template: typeof sessionTemplates.$inferSelect;
  bookings: (typeof bookings.$inferSelect & {
    user: typeof clerkUsers.$inferSelect;
  })[];
};

export async function getSessionInstancesForDateRange(
  startDate: Date,
  endDate: Date
): Promise<SessionInstanceWithBookings[]> {
  const supabase = createSupabaseServerClient();
  const instances = await supabase
    .from('session_instances')
    .select(`
      *,
      template:session_templates(*),
      bookings(
        *,
        user:clerk_users(*)
      )
    `)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())
    .order('start_time', { ascending: true });

  return instances.data as SessionInstanceWithBookings[];
}

export async function getSessionInstanceById(
  id: string
): Promise<SessionInstanceWithBookings | null> {
  const supabase = createSupabaseServerClient();
  const instance = await supabase
    .from('session_instances')
    .select(`
      *,
      template:session_templates(*),
      bookings(
        *,
        user:clerk_users(*)
      )
    `)
    .eq('id', id)
    .single();

  return instance.data as SessionInstanceWithBookings;
}

export async function updateBookingStatus(
  bookingId: string,
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', bookingId);
}

export async function createBooking(
  sessionInstanceId: string,
  userId: string,
  numberOfSpots: number = 1,
  notes?: string
): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.from('bookings').insert({
    session_instance_id: sessionInstanceId,
    user_id: userId,
    number_of_spots: numberOfSpots,
    notes,
    status: 'confirmed',
  });
}

export async function deleteBooking(
  bookingId: string
): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId);
} 