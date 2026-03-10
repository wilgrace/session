export type SessionVisibility = 'open' | 'hidden' | 'closed';

export interface Session {
  id: string
  name: string
  description?: string
  capacity: number
  duration: string
  visibility: SessionVisibility
  created_at: string
  updated_at: string
  created_by: string
}

export interface SessionSchedule {
  id: string
  session_id: string
  time: string
  days: string[]
  date?: string
  duration_minutes?: number | null
  created_at: string
  updated_at: string
}

export interface SessionOneOffDate {
  id: string
  template_id: string
  date: string            // YYYY-MM-DD
  time: string            // HH:MM
  duration_minutes: number | null
}

export interface SessionTemplate {
  id: string
  name: string
  description: string | null
  capacity: number
  duration_minutes: number
  visibility: SessionVisibility
  is_recurring?: boolean
  one_off_dates?: SessionOneOffDate[]
  recurrence_start_date?: string | null
  recurrence_end_date?: string | null
  created_at: string
  updated_at: string
  created_by: string
  organization_id: string
  schedules: SessionSchedule[]
  instances: SessionInstance[]
  booking_instructions?: string | null
  // Image field
  image_url?: string | null
  // Calendar display color
  event_color?: string | null
}

export interface SessionInstance {
  id: string
  template_id: string
  start_time: string
  end_time: string
  status: string
  cancelled_at?: string | null
  cancellation_reason?: string | null
  /** Resolved capacity: instance_override ?? schedule_default ?? template_default */
  effectiveCapacity?: number
  /** Remaining spots = effectiveCapacity - sum(active bookings) */
  spotsRemaining?: number
  /** Resolved name: instance name_override ?? template name */
  effectiveName?: string
  /** Resolved description: instance description_override ?? template description */
  effectiveDescription?: string | null
  bookings?: {
    id: string
    number_of_spots: number
    status?: string
    user: {
      clerk_user_id: string
    }
  }[]
} 