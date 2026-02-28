"use server"

import { SessionTemplate, SessionSchedule } from "@/types/session"
import { auth, currentUser } from "@clerk/nextjs/server"
import { mapDayStringToInt, mapIntToDayString } from "@/lib/day-utils"
import { ensureClerkUser } from "./clerk"
import { Booking } from "@/types/booking"
import { createSupabaseServerClient, getUserContextWithClient, UserContext } from "@/lib/supabase"
import Stripe from "stripe"
import { parseISO, set, addMinutes, formatISO, format, getDay } from "date-fns"
import { localToUTC, utcToLocal, SAUNA_TIMEZONE } from "@/lib/time-utils"
import { sendBookingCancellationEmail, sendBookingCancellationNotification } from "@/lib/email"

// Lazy initialization to avoid build-time errors when env vars aren't available
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
  })
}

// Helper function to get authenticated user
async function getAuthenticatedUser() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  return userId
}

// Alias for backward compatibility within this file
const createSupabaseClient = createSupabaseServerClient;

interface OneOffDateParam {
  date: string            // YYYY-MM-DD
  time: string            // HH:MM
  duration_minutes: number | null
}

// Build session_instances rows for date-type (non-recurring) templates
function buildInstancesFromOneOffDates(
  templateId: string,
  organizationId: string,
  templateDurationMinutes: number,
  dates: OneOffDateParam[]
) {
  return dates.map(d => {
    const [hours, mins] = d.time.split(':').map(Number)
    const localDate = set(parseISO(d.date), { hours, minutes: mins, seconds: 0, milliseconds: 0 })
    const startUTC = localToUTC(localDate, SAUNA_TIMEZONE)
    const effectiveDuration = d.duration_minutes ?? templateDurationMinutes
    const endUTC = addMinutes(startUTC, effectiveDuration)
    return {
      template_id: templateId,
      organization_id: organizationId,
      start_time: formatISO(startUTC),
      end_time: formatISO(endUTC),
      status: 'scheduled',
    }
  })
}

interface CreateSessionTemplateParams {
  name: string
  description: string | null
  capacity: number
  duration_minutes: number
  visibility: 'open' | 'hidden' | 'closed'
  is_recurring: boolean
  one_off_dates?: OneOffDateParam[]
  recurrence_start_date: string | null
  recurrence_end_date: string | null
  created_by: string
  schedules?: SessionSchedule[]
  // Pricing fields
  pricing_type?: 'free' | 'paid'
  drop_in_price?: number | null
  member_price?: number | null
  drop_in_enabled?: boolean
  booking_instructions?: string | null
  // Image field
  image_url?: string | null
  // Calendar display color
  event_color?: string | null
}

interface CreateSessionTemplateResult {
  success: boolean
  id?: string
  error?: string
}

interface CreateSessionInstanceParams {
  template_id: string
  start_time: string
  end_time: string
  status: string
}

interface CreateSessionInstanceResult {
  success: boolean
  id?: string
  error?: string
}

interface CreateSessionScheduleParams {
  session_template_id: string
  time: string
  days: string[]
  duration_minutes?: number | null
}

interface CreateSessionScheduleResult {
  success: boolean
  id?: string
  error?: string
}

interface UpdateSessionTemplateParams {
  id: string
  name?: string
  description?: string | null
  capacity?: number
  duration_minutes?: number
  visibility?: 'open' | 'hidden' | 'closed'
  is_recurring?: boolean
  recurrence_start_date?: string | null
  recurrence_end_date?: string | null
  // Pricing fields
  pricing_type?: 'free' | 'paid'
  drop_in_price?: number | null
  member_price?: number | null
  drop_in_enabled?: boolean
  booking_instructions?: string | null
  // Image field
  image_url?: string | null
  // Calendar display color
  event_color?: string | null
}

interface UpdateSessionTemplateResult {
  success: boolean
  error?: string
}

interface DeleteSessionSchedulesResult {
  success: boolean
  error?: string
}

interface DeleteSessionInstancesResult {
  success: boolean
  error?: string
}

interface DeleteScheduleResult {
  success: boolean
  error?: string
}

interface CreateBookingParams {
  session_template_id: string
  user_id: string
  start_time: string
  notes?: string
  number_of_spots?: number
}

interface CreateBookingResult {
  success: boolean
  id?: string
  error?: string
}

interface BookingResponse {
  id: string
  number_of_spots: number
  notes: string | null
  session_instances: {
    id: string
    start_time: string
    end_time: string
    session_templates: {
      id: string
      name: string
      duration_minutes: number
    }
  }
}

interface DBSessionInstance {
  id: string;
  template_id: string;
  start_time: string;
  end_time: string;
  status: string;
  bookings: {
    id: string;
    number_of_spots: number;
    user: {
      id: string;
      clerk_user_id: string;
    };
  }[];
}

interface DBSessionOneOffDate {
  id: string;
  template_id: string;
  date: string;
  time: string;
  duration_minutes: number | null;
}

interface DBSessionTemplate {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  duration_minutes: number;
  visibility: 'open' | 'hidden' | 'closed';
  is_recurring: boolean;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
  // Pricing fields
  pricing_type: string;
  drop_in_price: number | null;
  drop_in_enabled: boolean;
  booking_instructions: string | null;
  // Image field
  image_url: string | null;
  // Calendar display color
  event_color: string | null;
}

export async function createSessionTemplate(params: CreateSessionTemplateParams): Promise<CreateSessionTemplateResult> {
  try {
    const userId = await getAuthenticatedUser()

    // Verify the created_by matches the authenticated user
    if (params.created_by !== userId) {
      return {
        success: false,
        error: "Unauthorized: created_by must match authenticated user"
      }
    }

    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id, organization_id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return {
        success: false,
        error: "Failed to get clerk user"
      }
    }

    if (!userData) {
      return {
        success: false,
        error: "No clerk user found"
      }
    }

    // Determine which organization to use:
    // 1. Request headers (set by middleware for /[slug]/ routes)
    // 2. User's primary organization
    const { getTenantFromHeaders } = await import('@/lib/tenant-utils');
    const tenant = await getTenantFromHeaders();
    const organizationId = tenant?.organizationId || userData.organization_id;

    if (!organizationId) {
      return {
        success: false,
        error: "No organization specified"
      }
    }

    // Create the template first
    const { data, error } = await supabase
      .from("session_templates")
      .insert({
        name: params.name,
        description: params.description,
        capacity: params.capacity,
        duration_minutes: params.duration_minutes,
        visibility: params.visibility,
        is_recurring: params.is_recurring,
        recurrence_start_date: params.recurrence_start_date,
        recurrence_end_date: params.recurrence_end_date,
        created_by: userData.id,
        organization_id: organizationId,
        // Pricing fields
        pricing_type: params.pricing_type || 'paid',
        drop_in_price: params.drop_in_price,
        member_price: params.member_price,
        drop_in_enabled: params.drop_in_enabled ?? true,
        booking_instructions: params.booking_instructions,
        // Image field
        image_url: params.image_url,
        // Calendar display color
        event_color: params.event_color || '#3b82f6',
      })
      .select()
      .single()

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    if (!data) {
      return {
        success: false,
        error: "No data returned from insert"
      }
    }

    // Create schedules if provided
    if (params.schedules && params.schedules.length > 0) {
      const { error: scheduleError } = await supabase
        .from("session_schedules")
        .insert(params.schedules.map(schedule => ({
          ...schedule,
          session_template_id: data.id
        })));

      if (scheduleError) {
        return {
          success: false,
          error: `Failed to create schedules: ${scheduleError.message}`
        };
      }

      // Verify schedules were created
      const { data: createdSchedules, error: verifyError } = await supabase
        .from("session_schedules")
        .select("*")
        .eq("session_template_id", data.id);

      if (verifyError || !createdSchedules || createdSchedules.length === 0) {
        return {
          success: false,
          error: "Failed to verify schedule creation"
        };
      }
    }

    // Create one-off dates and their instances synchronously (for non-recurring templates)
    if (!params.is_recurring && params.one_off_dates && params.one_off_dates.length > 0) {
      const { error: datesError } = await supabase
        .from("session_one_off_dates")
        .insert(params.one_off_dates.map(d => ({
          template_id: data.id,
          organization_id: organizationId,
          date: d.date,
          time: d.time,
          duration_minutes: d.duration_minutes,
        })))

      if (datesError) {
        return { success: false, error: `Failed to create one-off dates: ${datesError.message}` }
      }

      // Create instances synchronously so they're available immediately
      const instanceRows = buildInstancesFromOneOffDates(
        data.id,
        organizationId,
        params.duration_minutes,
        params.one_off_dates
      )
      await supabase.from("session_instances").insert(instanceRows)
    }

    // Trigger instance generation for all templates (recurring and date-type)
    const shouldGenerate = params.is_recurring || (!params.is_recurring && params.one_off_dates && params.one_off_dates.length > 0)
    if (shouldGenerate) {
      try {
        const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
        const functionUrl = IS_DEVELOPMENT
          ? 'http://localhost:54321/functions/v1/generate-instances'
          : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-instances`;

        fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
          },
          body: JSON.stringify({ template_id_to_process: data.id }),
        }).catch(() => {})
      } catch (error) {
        // Don't fail the template creation if instance generation fails
      }
    }

    return {
      success: true,
      id: data.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

export async function createSessionInstance(params: CreateSessionInstanceParams): Promise<CreateSessionInstanceResult> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id, clerk_user_id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Verify the user has permission to create instances for this template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select(`
        created_by,
        organization_id
      `)
      .eq("id", params.template_id)
      .single()

    if (templateError || !template) {
      return {
        success: false,
        error: "Template not found"
      }
    }

    // Compare the created_by ID with the user's clerk_users.id
    if (template.created_by !== userData.id) {
      return {
        success: false,
        error: "Unauthorized: You can only create instances for your own templates"
      }
    }

    const { data, error } = await supabase
      .from("session_instances")
      .insert({
        template_id: params.template_id,
        start_time: params.start_time,
        end_time: params.end_time,
        status: params.status,
        organization_id: template.organization_id
      })
      .select()
      .single()

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    if (!data) {
      return {
        success: false,
        error: "No data returned from insert"
      }
    }

    return {
      success: true,
      id: data.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

export async function createSessionSchedule(params: CreateSessionScheduleParams): Promise<CreateSessionScheduleResult> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Verify the user has permission to create schedules for this template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("created_by")
      .eq("id", params.session_template_id)
      .single()

    if (templateError || !template) {
      return {
        success: false,
        error: "Template not found"
      }
    }

    if (template.created_by !== userData.id) {
      return {
        success: false,
        error: "Unauthorized: You can only create schedules for your own templates"
      }
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(params.time)) {
      return {
        success: false,
        error: "Invalid time format. Expected HH:mm"
      }
    }

    // Create a schedule for each day
    const schedulePromises = params.days.map(async (day) => {
      const dayOfWeek = mapDayStringToInt(day)


      const { data, error } = await supabase
        .from("session_schedules")
        .insert({
          session_template_id: params.session_template_id,
          day_of_week: dayOfWeek,
          time: params.time,
          is_active: true,
          duration_minutes: params.duration_minutes || null
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      return data
    })

    const results = await Promise.all(schedulePromises)

    if (results.some(result => !result)) {
      return {
        success: false,
        error: "Failed to create some schedules"
      }
    }

    // Log the created schedules

    return { success: true }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    }
  }
}

export async function getSessions(organizationId?: string): Promise<{ data: SessionTemplate[] | null; error: string | null }> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { data: null, error: "No user ID from Clerk" }
    }

    const supabase = createSupabaseClient()

    // Get the user's clerk_users record (use maybeSingle to handle missing users)
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id, organization_id")
      .eq("clerk_user_id", userId)
      .maybeSingle()


    if (userError) {
      return { data: null, error: `Failed to get clerk user: ${userError.message} (code: ${userError.code})` }
    }

    // If user doesn't exist, create them
    let clerkUserId: string
    let userOrgId: string | null = null
    if (!userData) {
      const user = await currentUser()
      if (!user) {
        return { data: null, error: "Failed to get user info from Clerk" }
      }

      const email = user.emailAddresses[0]?.emailAddress
      if (!email) {
        return { data: null, error: "User email not found" }
      }

      const ensureResult = await ensureClerkUser(
        userId,
        email,
        user.firstName,
        user.lastName
      )

      if (!ensureResult.success || !ensureResult.id) {
        return { data: null, error: `Failed to create clerk user: ${ensureResult.error}` }
      }

      clerkUserId = ensureResult.id
    } else {
      clerkUserId = userData.id
      userOrgId = userData.organization_id
    }

    // Determine which organization to filter by:
    // 1. Explicit parameter
    // 2. Request headers (set by middleware for /[slug]/ routes)
    // 3. User's primary organization
    let orgId: string | undefined = organizationId;

    if (!orgId) {
      // Try to get from request headers
      const { getTenantFromHeaders } = await import('@/lib/tenant-utils');
      const tenant = await getTenantFromHeaders();
      orgId = tenant?.organizationId;
    }

    if (!orgId && userOrgId) {
      orgId = userOrgId;
    }

    if (!orgId) {
      return { data: null, error: "No organization specified" }
    }

    // Get templates for this organization
    const { data: templates, error: templatesError } = await supabase
      .from("session_templates")
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        visibility,
        is_recurring,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id,
        pricing_type,
        drop_in_price,
        drop_in_enabled,
        booking_instructions,
        image_url,
        event_color
      `)
      .eq('organization_id', orgId)
      .order("created_at", { ascending: false })

    if (templatesError) {
      return { data: null, error: templatesError.message }
    }

    if (!templates || templates.length === 0) {
      return { data: [], error: null }
    }

    // Get schedules
    const templateIds = templates.map(t => t.id)
    const { data: schedules, error: schedulesError } = await supabase
      .from("session_schedules")
      .select(`
        id,
        session_template_id,
        day_of_week,
        is_active,
        created_at,
        updated_at,
        time,
        duration_minutes
      `)
      .in('session_template_id', templateIds)

    if (schedulesError) {
      return { data: null, error: schedulesError.message }
    }

    // Get one-off dates for all non-recurring templates
    const { data: oneOffDates, error: oneOffDatesError } = await supabase
      .from("session_one_off_dates")
      .select(`id, template_id, date, time, duration_minutes`)
      .in('template_id', templateIds)
      .order('date', { ascending: true })

    if (oneOffDatesError) {
      return { data: null, error: oneOffDatesError.message }
    }

    // Get instances with bookings
    const { data: instances, error: instancesError } = await supabase
      .from("session_instances")
      .select(`
        id,
        template_id,
        start_time,
        end_time,
        status,
        bookings (
          id,
          number_of_spots,
          user:clerk_users!user_id (
            id,
            clerk_user_id
          )
        )
      `)
      .in('template_id', templateIds)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })

    if (instancesError) {
      return { data: null, error: instancesError.message }
    }

    // Transform the data
    const transformedData = (templates as DBSessionTemplate[]).map(template => {
      const templateSchedules = schedules?.filter(s => s.session_template_id === template.id) || []
      const templateInstances = (instances as unknown as DBSessionInstance[])?.filter(i => i.template_id === template.id) || []
      const templateOneOffDates = (oneOffDates as DBSessionOneOffDate[])?.filter(d => d.template_id === template.id) || []

      // Group schedules by time
      const scheduleGroups: Record<string, SessionSchedule> = templateSchedules.reduce((groups, schedule) => {
        const time = schedule.time?.substring(0, 5)
        if (!groups[time]) {
          groups[time] = {
            id: schedule.id,
            time,
            days: [],
            session_id: template.id,
            is_recurring: true,
            duration_minutes: schedule.duration_minutes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        const dayName = mapIntToDayString(schedule.day_of_week, true)
        groups[time].days.push(dayName)
        return groups
      }, {} as Record<string, SessionSchedule>)

      // Transform instances to include bookings
      const transformedInstances = templateInstances.map(instance => {
        const bookings = instance.bookings?.map(booking => {
          const user = booking.user;
          return {
            id: booking.id,
            number_of_spots: booking.number_of_spots || 1,
            user: {
              clerk_user_id: user?.clerk_user_id || ''
            }
          };
        }) || [];

        return {
          id: instance.id,
          start_time: instance.start_time,
          end_time: instance.end_time,
          status: instance.status,
          template_id: template.id,
          bookings
        };
      });

      const transformedTemplate = {
        id: template.id,
        name: template.name,
        description: template.description,
        capacity: template.capacity,
        duration_minutes: template.duration_minutes,
        visibility: template.visibility,
        is_recurring: template.is_recurring ?? false,
        one_off_dates: templateOneOffDates.map(d => ({
          id: d.id,
          template_id: d.template_id,
          date: d.date,
          time: d.time.substring(0, 5),
          duration_minutes: d.duration_minutes,
        })),
        recurrence_start_date: template.recurrence_start_date,
        recurrence_end_date: template.recurrence_end_date,
        created_at: template.created_at,
        updated_at: template.updated_at,
        created_by: template.created_by,
        organization_id: template.organization_id,
        schedules: Object.values(scheduleGroups),
        instances: transformedInstances,
        // Pricing fields
        pricing_type: template.pricing_type,
        drop_in_price: template.drop_in_price,
        drop_in_enabled: template.drop_in_enabled ?? true,
        booking_instructions: template.booking_instructions,
        // Image field
        image_url: template.image_url,
        // Calendar display color
        event_color: template.event_color,
      } as unknown as SessionTemplate

      return transformedTemplate
    })

    return { data: transformedData, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

export async function getSession(id: string): Promise<{ data: SessionTemplate | null; error: string | null }> {
  
  try {
    // Check authentication state
    const { userId } = await auth();

    if (!userId) {
      return { 
        data: null, 
        error: "No user ID from Clerk" 
      };
    }

    const supabase = createSupabaseClient();

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();


    if (userError) {
      return { data: null, error: "Failed to get clerk user" };
    }

    if (!userData) {
      return { data: null, error: "No clerk user found" };
    }

    // First get the template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        visibility,
        is_recurring,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id,
        pricing_type,
        drop_in_price,
        drop_in_enabled,
        booking_instructions,
        image_url
      `)
      .eq("id", id)
      .single();

    if (templateError) {
      return { data: null, error: templateError.message };
    }

    if (!template) {
      return { data: null, error: "Template not found" };
    }

    // Then get the schedules
    const { data: schedules, error: schedulesError } = await supabase
      .from("session_schedules")
      .select(`
        id,
        session_template_id,
        day_of_week,
        is_active,
        created_at,
        updated_at,
        time,
        duration_minutes
      `)
      .eq("session_template_id", id);

    if (schedulesError) {
      return { data: null, error: schedulesError.message };
    }

    // Get instances and one-off dates in parallel
    const [
      { data: instances, error: instancesError },
      { data: oneOffDates, error: oneOffDatesError }
    ] = await Promise.all([
      supabase
        .from("session_instances")
        .select(`id, template_id, start_time, end_time, status`)
        .eq("template_id", id),
      supabase
        .from("session_one_off_dates")
        .select(`id, template_id, date, time, duration_minutes`)
        .eq("template_id", id)
        .order('date', { ascending: true })
    ])

    if (instancesError) {
      return { data: null, error: instancesError.message };
    }

    // Group schedules by time
    const scheduleGroups: Record<string, SessionSchedule> = (schedules || []).reduce((groups, schedule) => {
      const time = schedule.time;
      if (!groups[time]) {
        groups[time] = {
          id: schedule.id,
          time,
          days: [],
          session_id: template.id,
          is_recurring: true,
          duration_minutes: schedule.duration_minutes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      const dayName = mapIntToDayString(schedule.day_of_week, true);
      groups[time].days.push(dayName);
      return groups;
    }, {} as Record<string, SessionSchedule>);

    // Transform the data to match SessionTemplate type
    const transformedData = {
      ...template,
      is_recurring: template.is_recurring ?? false,
      one_off_dates: (oneOffDates || []).map(d => ({
        id: d.id,
        template_id: d.template_id,
        date: d.date,
        time: d.time.substring(0, 5),
        duration_minutes: d.duration_minutes,
      })),
      schedules: Object.values(scheduleGroups),
      instances: instances?.map(instance => ({
        id: instance.id,
        template_id: template.id,
        start_time: instance.start_time,
        end_time: instance.end_time,
        status: instance.status || 'scheduled',
        bookings: []
      })) || []
    };

    return { data: transformedData, error: null };
  } catch (error) {
    return { 
      data: null, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

export async function updateSessionTemplate(params: UpdateSessionTemplateParams): Promise<UpdateSessionTemplateResult> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id, role, organization_id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Fetch template to verify org membership
    const { data: template, error: fetchError } = await supabase
      .from("session_templates")
      .select("organization_id")
      .eq("id", params.id)
      .single()

    if (fetchError || !template) {
      return { success: false, error: "Template not found" }
    }

    const hasAccess =
      userData.role === 'superadmin' ||
      (userData.role === 'admin' && userData.organization_id === template.organization_id)

    if (!hasAccess) {
      return { success: false, error: "Unauthorized: Admin access required" }
    }

    // Remove id from update fields
    const id = params.id;
    const updateFields = { ...params };
    delete (updateFields as any).id;
    (updateFields as any)["updated_at"] = new Date().toISOString();

    const { error } = await supabase
      .from("session_templates")
      .update(updateFields)
      .eq("id", id)

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function deleteSessionSchedules(templateId: string): Promise<DeleteSessionSchedulesResult> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Verify the user owns the template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("created_by")
      .eq("id", templateId)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Template not found" }
    }

    if (template.created_by !== userData.id) {
      return { success: false, error: "Unauthorized: You can only delete schedules for your own templates" }
    }

    const { error } = await supabase
      .from("session_schedules")
      .delete()
      .eq("session_template_id", templateId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function deleteSessionInstances(templateId: string): Promise<DeleteSessionInstancesResult> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Verify the user owns the template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("created_by")
      .eq("id", templateId)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Template not found" }
    }

    if (template.created_by !== userData.id) {
      return { success: false, error: "Unauthorized: You can only delete instances for your own templates" }
    }

    const { error } = await supabase
      .from("session_instances")
      .delete()
      .eq("template_id", templateId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function updateSessionWithSchedules(params: {
  templateId: string
  template: Omit<UpdateSessionTemplateParams, 'id'>
  schedules: Array<{ time: string; days: string[]; duration_minutes?: number | null }>
  isRecurring: boolean
  one_off_dates?: OneOffDateParam[]
}): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get user's clerk_users record (once)
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id, role, organization_id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError || !userData) {
      return { success: false, error: "Failed to get user" }
    }

    // Fetch template to verify org membership
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("organization_id")
      .eq("id", params.templateId)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Template not found" }
    }

    const hasAccess =
      userData.role === 'superadmin' ||
      (userData.role === 'admin' && userData.organization_id === template.organization_id)

    if (!hasAccess) {
      return { success: false, error: "Unauthorized: Admin access required" }
    }

    // Update template + delete schedules + delete instances + delete one_off_dates in parallel
    const updateFields = { ...params.template, updated_at: new Date().toISOString() }
    const results = await Promise.all([
      supabase.from("session_templates").update(updateFields).eq("id", params.templateId),
      supabase.from("session_schedules").delete().eq("session_template_id", params.templateId),
      supabase.from("session_instances").delete().eq("template_id", params.templateId),
      supabase.from("session_one_off_dates").delete().eq("template_id", params.templateId),
    ])

    if (results[0].error) {
      return { success: false, error: results[0].error.message }
    }

    const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
    const functionUrl = IS_DEVELOPMENT
      ? 'http://localhost:54321/functions/v1/generate-instances'
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-instances`

    // Batch insert new schedules (if recurring)
    if (params.isRecurring && params.schedules.length > 0) {
      const scheduleRows = params.schedules.flatMap(schedule =>
        schedule.days.map(day => ({
          session_template_id: params.templateId,
          day_of_week: mapDayStringToInt(day),
          time: schedule.time,
          is_active: true,
          duration_minutes: schedule.duration_minutes ?? null,
        }))
      )

      if (scheduleRows.length > 0) {
        const { error: scheduleError } = await supabase
          .from("session_schedules")
          .insert(scheduleRows)

        if (scheduleError) {
          return { success: false, error: `Failed to create schedules: ${scheduleError.message}` }
        }
      }

      // Fire-and-forget instance generation
      fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ template_id_to_process: params.templateId }),
      }).catch(() => {})
    }

    // Insert new one-off dates (if date-type template)
    if (!params.isRecurring && params.one_off_dates && params.one_off_dates.length > 0) {
      // Fetch the template's org id for the new rows
      const { data: tpl } = await supabase
        .from("session_templates")
        .select("organization_id")
        .eq("id", params.templateId)
        .single()

      const { error: datesError } = await supabase
        .from("session_one_off_dates")
        .insert(params.one_off_dates.map(d => ({
          template_id: params.templateId,
          organization_id: tpl?.organization_id,
          date: d.date,
          time: d.time,
          duration_minutes: d.duration_minutes,
        })))

      if (datesError) {
        return { success: false, error: `Failed to create one-off dates: ${datesError.message}` }
      }

      // Create instances synchronously so they're available immediately
      // (instances for this template were already deleted in the parallel step above)
      const instanceRows = buildInstancesFromOneOffDates(
        params.templateId,
        tpl?.organization_id ?? '',
        params.template.duration_minutes ?? 75,
        params.one_off_dates
      )
      await supabase.from("session_instances").insert(instanceRows)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function deleteSessionTemplate(templateId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Verify the user owns the template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("created_by")
      .eq("id", templateId)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Template not found" }
    }

    if (template.created_by !== userData.id) {
      return { success: false, error: "Unauthorized: You can only delete your own templates" }
    }

    const { error } = await supabase
      .from("session_templates")
      .delete()
      .eq("id", templateId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function deleteSchedule(scheduleId: string): Promise<DeleteScheduleResult> {
  try {
    const userId = await getAuthenticatedUser()
    const supabase = createSupabaseClient()

    // Get the user's clerk_users record
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // First get the schedule to find its template
    const { data: schedule, error: scheduleError } = await supabase
      .from("session_schedules")
      .select("session_template_id")
      .eq("id", scheduleId)
      .single()

    if (scheduleError || !schedule) {
      return { success: false, error: "Schedule not found" }
    }

    // Verify the user owns the template
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("created_by")
      .eq("id", schedule.session_template_id)
      .single()

    if (templateError || !template) {
      return { success: false, error: "Template not found" }
    }

    if (template.created_by !== userData.id) {
      return { success: false, error: "Unauthorized: You can only delete schedules for your own templates" }
    }

    // Delete the specific schedule
    const { error } = await supabase
      .from("session_schedules")
      .delete()
      .eq("id", scheduleId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" }
  }
}

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  try {
    
    const supabase = createSupabaseClient()

    // First, verify that the user exists in clerk_users
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id, organization_id, clerk_user_id")
      .eq("id", params.user_id)
      .single()

    if (userError) {
      return {
        success: false,
        error: "User not found"
      }
    }

    if (!userData) {
      return {
        success: false,
        error: "User not found"
      }
    }


    // Get the session template to verify it exists and is bookable
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("duration_minutes, visibility, organization_id")
      .eq("id", params.session_template_id)
      .single()

    if (templateError) {
      return {
        success: false,
        error: "Failed to verify session availability"
      }
    }

    if (!template) {
      return {
        success: false,
        error: "Session not found"
      }
    }


    if (template.visibility === 'closed') {
      return {
        success: false,
        error: "This session is not available for booking"
      }
    }

    // Verify the user belongs to the same organization as the template
    if (userData.organization_id !== template.organization_id) {
      return {
        success: false,
        error: "You can only book sessions from your organization"
      }
    }

    // Find or create the instance for this time slot
    const startTime = new Date(params.start_time)
    const endTime = new Date(startTime.getTime() + template.duration_minutes * 60000)

    let instance;
    const { data: existingInstance, error: instanceError } = await supabase
      .from("session_instances")
      .select("id")
      .eq("template_id", params.session_template_id)
      .eq("start_time", startTime.toISOString())
      .eq("end_time", endTime.toISOString())
      .eq("status", "scheduled")
      .maybeSingle()

    // Handle errors
    if (instanceError) {
      // If it's a "no rows" error (PGRST116), we'll create the instance below
      // Otherwise, it's a real error
      if (instanceError.code !== 'PGRST116') {
        return {
          success: false,
          error: "Failed to find session instance"
        }
      }
    }

    // If instance doesn't exist (no data and either no error or PGRST116), create it
    if (!existingInstance) {
      
      const { data: newInstance, error: createError } = await supabase
        .from("session_instances")
        .insert({
          template_id: params.session_template_id,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: "scheduled",
          organization_id: template.organization_id
        })
        .select("id")
        .single()

      if (createError || !newInstance) {
        return {
          success: false,
          error: "Failed to create session instance"
        }
      }

      instance = newInstance;
    } else {
      instance = existingInstance;
    }

    // Create a new Supabase client for the booking to ensure fresh auth state
    const bookingSupabase = createSupabaseClient();
    
    // Create the booking
    const bookingData = {
      session_instance_id: instance.id,
      user_id: userData.id,
      number_of_spots: params.number_of_spots || 1,
      status: "confirmed",
      notes: params.notes,
      organization_id: template.organization_id
    };


    const { data, error } = await bookingSupabase
      .from("bookings")
      .insert(bookingData)
      .select()
      .single()

    if (error) {
      return {
        success: false,
        error: error.message || "Failed to create booking"
      }
    }


    return {
      success: true,
      id: data.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

export async function getPublicSessions(): Promise<{ data: SessionTemplate[] | null; error: string | null }> {
  try {
    const supabase = createSupabaseClient()

    // Check if the current user is an admin or superadmin
    let isAdmin = false
    const { userId } = await auth()
    if (userId) {
      const { data: userData } = await supabase
        .from("clerk_users")
        .select("role")
        .eq("clerk_user_id", userId)
        .single()

      if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
        isAdmin = true
      }
    }

    // Build the query - admins see 'open' and 'hidden', regular users only see 'open'
    let query = supabase
      .from("session_templates")
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        visibility,
        is_recurring,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id,
        pricing_type,
        drop_in_price,
        drop_in_enabled,
        booking_instructions,
        image_url,
        event_color
      `)
      .order("created_at", { ascending: false })

    // Filter by visibility based on user role
    if (isAdmin) {
      // Admins see 'open' and 'hidden' sessions (but not 'closed')
      query = query.in('visibility', ['open', 'hidden'])
    } else {
      // Regular users and guests only see 'open' sessions
      query = query.eq('visibility', 'open')
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      // Provide more helpful error message
      const errorMessage = templatesError.message || 'Unknown error';
      if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
        return {
          data: null,
          error: `Cannot connect to Supabase. Please check that NEXT_PUBLIC_SUPABASE_URL is set correctly in your Vercel environment variables. Error: ${errorMessage}`
        }
      }
      return { data: null, error: `Templates query failed: ${errorMessage}` }
    }


    if (!templates || templates.length === 0) {
      return { data: [], error: null }
    }

    // Get schedules for all templates
    const templateIds = templates.map(t => t.id)

    const [
      { data: schedules, error: schedulesError },
      { data: oneOffDates, error: oneOffDatesError }
    ] = await Promise.all([
      supabase
        .from("session_schedules")
        .select(`id, session_template_id, day_of_week, is_active, created_at, updated_at, time, duration_minutes`)
        .in('session_template_id', templateIds),
      supabase
        .from("session_one_off_dates")
        .select(`id, template_id, date, time, duration_minutes`)
        .in('template_id', templateIds)
        .order('date', { ascending: true })
    ])

    if (schedulesError) {
      return { data: null, error: `Schedules query failed: ${schedulesError.message}` }
    }

    // Check for templates that need instances generated
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

    const recurringTemplates = templates.filter(t => t.is_recurring)
    const recurringTemplateIds = recurringTemplates.map(t => t.id)

    // Build a Set of template IDs that have schedules for O(1) lookup
    const templatesWithSchedules = new Set(schedules?.map(s => s.session_template_id) || [])
    const templatesWithOneOffDates = new Set((oneOffDates || []).map(d => d.template_id))

    // Single batch query to check which templates have instances (instead of N queries)
    let templatesWithInstances = new Set<string>()
    if (recurringTemplateIds.length > 0) {
      const { data: existingInstances } = await supabase
        .from("session_instances")
        .select("template_id")
        .in("template_id", recurringTemplateIds)
        .gte("start_time", new Date().toISOString())
        .lte("start_time", threeMonthsFromNow.toISOString())

      templatesWithInstances = new Set(existingInstances?.map(i => i.template_id) || [])
    }

    // Find recurring templates that need generation: has schedules + no instances
    const recurringNeedingGeneration = recurringTemplateIds.filter(
      id => templatesWithSchedules.has(id) && !templatesWithInstances.has(id)
    )

    // Find date-type templates that need generation: has one_off_dates + no instances
    const dateTypeTemplateIds = templates.filter(t => !t.is_recurring).map(t => t.id)
    let dateTypeWithInstances = new Set<string>()
    if (dateTypeTemplateIds.length > 0) {
      const { data: existingDateInstances } = await supabase
        .from("session_instances")
        .select("template_id")
        .in("template_id", dateTypeTemplateIds)
      dateTypeWithInstances = new Set(existingDateInstances?.map(i => i.template_id) || [])
    }
    const dateTypeNeedingGeneration = dateTypeTemplateIds.filter(
      id => templatesWithOneOffDates.has(id) && !dateTypeWithInstances.has(id)
    )

    const templatesNeedingGeneration = [...recurringNeedingGeneration, ...dateTypeNeedingGeneration]

    // Trigger generation for templates that need it (in parallel, but don't wait)
    if (templatesNeedingGeneration.length > 0) {
      const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
      const functionUrl = IS_DEVELOPMENT
        ? 'http://localhost:54321/functions/v1/generate-instances'
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-instances`

      // Trigger generation for all templates in parallel (fire and forget)
      Promise.all(
        templatesNeedingGeneration.map(templateId =>
          fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
            },
            body: JSON.stringify({ template_id_to_process: templateId }),
          }).catch(() => {})
        )
      ).catch(() => {})

      // Wait a short time for generation to start (instances may be available on next fetch)
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Get instances for all templates with their bookings
    const { data: instances, error: instancesError } = await supabase
      .from("session_instances")
      .select(`
        id,
        template_id,
        start_time,
        end_time,
        status,
        bookings (
          id,
          number_of_spots,
          user:clerk_users!user_id (
            id,
            clerk_user_id
          )
        )
      `)
      .in('template_id', templateIds)
      .gte('start_time', new Date().toISOString()) // Only get future instances
      .order('start_time', { ascending: true })

    if (instancesError) {
      return { data: null, error: `Instances query failed: ${instancesError.message}` }
    }

    // Combine the data
    const transformedData = (templates as DBSessionTemplate[]).map(template => {
      const templateSchedules = schedules?.filter(s => s.session_template_id === template.id) || []
      const templateInstances = (instances as unknown as DBSessionInstance[])?.filter(i => i.template_id === template.id) || []

      // Group schedules by time
      const scheduleGroups: Record<string, SessionSchedule> = templateSchedules.reduce((groups, schedule) => {
        const time = schedule.time?.substring(0, 5)
        if (!groups[time]) {
          groups[time] = {
            id: schedule.id,
            time,
            days: [],
            session_id: template.id,
            is_recurring: true,
            duration_minutes: schedule.duration_minutes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        const dayName = mapIntToDayString(schedule.day_of_week, true)
        groups[time].days.push(dayName)
        return groups
      }, {} as Record<string, SessionSchedule>)

      // Transform instances to include bookings
      const transformedInstances = templateInstances.map(instance => {
        const bookings = instance.bookings?.map(booking => {
          const user = booking.user;
          return {
            id: booking.id,
            number_of_spots: booking.number_of_spots || 1,
            user: {
              clerk_user_id: user?.clerk_user_id || ''
            }
          };
        }) || [];

        return {
          id: instance.id,
          start_time: instance.start_time,
          end_time: instance.end_time,
          status: instance.status,
          template_id: template.id,
          bookings
        };
      });

      return {
        ...template,
        is_recurring: template.is_recurring ?? false,
        one_off_dates: (oneOffDates || [])
          .filter(d => d.template_id === template.id)
          .map(d => ({
            id: d.id,
            template_id: d.template_id,
            date: d.date,
            time: d.time.substring(0, 5),
            duration_minutes: d.duration_minutes,
          })),
        schedules: Object.values(scheduleGroups),
        instances: transformedInstances
      } as SessionTemplate
    })

    return { data: transformedData, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

/**
 * Get public sessions for a specific organization.
 * Filters session templates by organization_id.
 * Admins and superadmins can see hidden sessions; regular users only see open sessions.
 */
export async function getPublicSessionsByOrg(organizationId: string): Promise<{ data: SessionTemplate[] | null; error: string | null }> {
  try {
    const supabase = createSupabaseClient()

    // Check if the current user is an admin or superadmin
    let isAdmin = false
    const { userId } = await auth()
    if (userId) {
      const { data: userData } = await supabase
        .from("clerk_users")
        .select("role")
        .eq("clerk_user_id", userId)
        .single()

      if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
        isAdmin = true
      }
    }

    // Build the query - admins see 'open' and 'hidden', regular users only see 'open'
    let query = supabase
      .from("session_templates")
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        visibility,
        is_recurring,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id,
        pricing_type,
        drop_in_price,
        drop_in_enabled,
        booking_instructions,
        image_url,
        event_color
      `)
      .eq('organization_id', organizationId)
      .order("created_at", { ascending: false })

    // Filter by visibility based on user role
    if (isAdmin) {
      // Admins see 'open' and 'hidden' sessions (but not 'closed')
      query = query.in('visibility', ['open', 'hidden'])
    } else {
      // Regular users and guests only see 'open' sessions
      query = query.eq('visibility', 'open')
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      const errorMessage = templatesError.message || 'Unknown error';
      if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
        return {
          data: null,
          error: `Cannot connect to Supabase. Please check that NEXT_PUBLIC_SUPABASE_URL is set correctly in your Vercel environment variables. Error: ${errorMessage}`
        }
      }
      return { data: null, error: `Templates query failed: ${errorMessage}` }
    }

    if (!templates || templates.length === 0) {
      return { data: [], error: null }
    }

    // Fetch schedules and instances in parallel (both are independent after we have templateIds)
    const templateIds = templates.map(t => t.id)
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
    const now = new Date().toISOString()

    const [
      { data: schedules, error: schedulesError },
      { data: oneOffDates, error: oneOffDatesError },
      { data: instances, error: instancesError }
    ] = await Promise.all([
      supabase
        .from("session_schedules")
        .select(`id, session_template_id, day_of_week, is_active, created_at, updated_at, time, duration_minutes`)
        .in('session_template_id', templateIds),
      supabase
        .from("session_one_off_dates")
        .select(`id, template_id, date, time, duration_minutes`)
        .in('template_id', templateIds)
        .order('date', { ascending: true }),
      supabase
        .from("session_instances")
        .select(`
          id,
          template_id,
          start_time,
          end_time,
          status,
          bookings (
            id,
            number_of_spots,
            user:clerk_users!user_id (
              id,
              clerk_user_id
            )
          )
        `)
        .in('template_id', templateIds)
        .gte('start_time', now)
        .lte('start_time', threeMonthsFromNow.toISOString())
        .order('start_time', { ascending: true })
    ])

    if (schedulesError) {
      return { data: null, error: `Schedules query failed: ${schedulesError.message}` }
    }

    if (instancesError) {
      return { data: null, error: `Instances query failed: ${instancesError.message}` }
    }

    // Determine which templates need instance generation
    const recurringTemplateIds = templates.filter(t => t.is_recurring).map(t => t.id)
    const dateTypeTemplateIds = templates.filter(t => !t.is_recurring).map(t => t.id)
    const templatesWithSchedules = new Set(schedules?.map(s => s.session_template_id) || [])
    const templatesWithOneOffDates = new Set((oneOffDates || []).map(d => d.template_id))
    const templatesWithInstances = new Set(instances?.map(i => i.template_id) || [])

    const recurringNeedingGeneration = recurringTemplateIds.filter(
      id => templatesWithSchedules.has(id) && !templatesWithInstances.has(id)
    )
    const dateTypeNeedingGeneration = dateTypeTemplateIds.filter(
      id => templatesWithOneOffDates.has(id) && !templatesWithInstances.has(id)
    )
    const templatesNeedingGeneration = [...recurringNeedingGeneration, ...dateTypeNeedingGeneration]

    if (templatesNeedingGeneration.length > 0) {
      const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
      const functionUrl = IS_DEVELOPMENT
        ? 'http://localhost:54321/functions/v1/generate-instances'
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-instances`

      Promise.all(
        templatesNeedingGeneration.map(templateId =>
          fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
            },
            body: JSON.stringify({ template_id_to_process: templateId }),
          }).catch(() => {})
        )
      ).catch(() => {})
    }

    // Combine the data
    const transformedData = (templates as DBSessionTemplate[]).map(template => {
      const templateSchedules = schedules?.filter(s => s.session_template_id === template.id) || []
      const templateInstances = (instances as unknown as DBSessionInstance[])?.filter(i => i.template_id === template.id) || []
      const templateOneOffDates = (oneOffDates as DBSessionOneOffDate[] || []).filter(d => d.template_id === template.id)

      const scheduleGroups: Record<string, SessionSchedule> = templateSchedules.reduce((groups, schedule) => {
        const time = schedule.time?.substring(0, 5)
        if (!groups[time]) {
          groups[time] = {
            id: schedule.id,
            time,
            days: [],
            session_id: template.id,
            is_recurring: true,
            duration_minutes: schedule.duration_minutes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        const dayName = mapIntToDayString(schedule.day_of_week, true)
        groups[time].days.push(dayName)
        return groups
      }, {} as Record<string, SessionSchedule>)

      const transformedInstances = templateInstances.map(instance => {
        const bookings = instance.bookings?.map(booking => {
          const user = booking.user;
          return {
            id: booking.id,
            number_of_spots: booking.number_of_spots || 1,
            user: {
              clerk_user_id: user?.clerk_user_id || ''
            }
          };
        }) || [];

        return {
          id: instance.id,
          start_time: instance.start_time,
          end_time: instance.end_time,
          status: instance.status,
          template_id: template.id,
          bookings
        };
      });

      return {
        ...template,
        is_recurring: template.is_recurring ?? false,
        one_off_dates: templateOneOffDates.map(d => ({
          id: d.id,
          template_id: d.template_id,
          date: d.date,
          time: d.time.substring(0, 5),
          duration_minutes: d.duration_minutes,
        })),
        schedules: Object.values(scheduleGroups),
        instances: transformedInstances
      } as SessionTemplate
    })

    return { data: transformedData, error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    }
  }
}

export async function updateBooking({
  booking_id,
  notes,
  number_of_spots,
}: {
  booking_id: string
  notes?: string
  number_of_spots: number
}) {
  try {

    const supabase = createSupabaseClient();

    // First verify the booking exists
    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', booking_id)
      .maybeSingle();

    if (checkError) {
      return { success: false, error: `Failed to verify booking: ${checkError.message}` };
    }

    if (!existingBooking) {
      return { success: false, error: "Booking not found" };
    }

    // Now update the booking
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        notes,
        number_of_spots,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id)
      .select()
      .maybeSingle();

    if (error) {
      return { success: false, error: `Failed to update booking: ${error.message}` };
    }

    if (!booking) {
      return { success: false, error: "Failed to update booking: No data returned" };
    }

    return { success: true, data: booking };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteBooking(booking_id: string) {
  try {
    console.log('[deleteBooking] Starting delete for booking_id:', booking_id);
    const supabase = createSupabaseServerClient();

    // First verify the booking exists
    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id, user_id, session_instance_id')
      .eq('id', booking_id)
      .single();

    console.log('[deleteBooking] Existing booking:', existingBooking, 'checkError:', checkError);

    if (checkError) {
      return { success: false, error: `Failed to verify booking: ${checkError.message}` };
    }

    if (!existingBooking) {
      return { success: false, error: "Booking not found" };
    }

    // Now delete the booking
    const { error: deleteError, count } = await supabase
      .from('bookings')
      .delete()
      .eq('id', booking_id);

    console.log('[deleteBooking] Delete result - error:', deleteError, 'count:', count);

    if (deleteError) {
      return { success: false, error: `Failed to delete booking: ${deleteError.message}` };
    }

    // Verify the booking was actually deleted
    const { data: verifyDeleted } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', booking_id)
      .maybeSingle();

    console.log('[deleteBooking] Verify deleted - booking still exists:', !!verifyDeleted);

    if (verifyDeleted) {
      return { success: false, error: "Booking deletion failed - record still exists" };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[deleteBooking] Exception:', error);
    return { success: false, error: error.message };
  }
}

export async function cancelBookingWithRefund(bookingId: string, { notifyAdmin = false }: { notifyAdmin?: boolean } = {}): Promise<{
  success: boolean
  refunded?: boolean
  error?: string
}> {
  try {
    console.log('[cancelBookingWithRefund] Starting cancellation for booking_id:', bookingId);
    const supabase = createSupabaseServerClient();

    // 1. Fetch booking with payment details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, payment_status, stripe_payment_intent_id, amount_paid, organization_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('[cancelBookingWithRefund] Booking not found:', bookingError);
      return { success: false, error: 'Booking not found' };
    }

    console.log('[cancelBookingWithRefund] Booking found:', {
      id: booking.id,
      payment_status: booking.payment_status,
      has_payment_intent: !!booking.stripe_payment_intent_id,
      amount_paid: booking.amount_paid,
    });

    let refunded = false;

    // 2. Process refund if payment was completed
    if (booking.payment_status === 'completed' && booking.stripe_payment_intent_id) {
      // Get the Connected Account ID for this organization
      const { data: stripeAccount, error: stripeAccountError } = await supabase
        .from('stripe_connect_accounts')
        .select('stripe_account_id')
        .eq('organization_id', booking.organization_id)
        .single();

      if (stripeAccountError || !stripeAccount) {
        console.error('[cancelBookingWithRefund] Stripe account not found:', stripeAccountError);
        return { success: false, error: 'Unable to process refund - Stripe account not found' };
      }

      try {
        const stripe = getStripe();
        console.log('[cancelBookingWithRefund] Processing refund for payment_intent:', booking.stripe_payment_intent_id);

        // Create refund on the Connected Account
        await stripe.refunds.create(
          { payment_intent: booking.stripe_payment_intent_id },
          { stripeAccount: stripeAccount.stripe_account_id }
        );

        refunded = true;
        console.log('[cancelBookingWithRefund] Refund processed successfully');
      } catch (stripeError: any) {
        console.error('[cancelBookingWithRefund] Stripe refund failed:', stripeError);
        // Don't delete the booking if refund fails
        return {
          success: false,
          error: `Refund failed: ${stripeError.message || 'Unknown error'}. Please contact support.`
        };
      }
    }

    // 3. Send cancellation emails before deleting (booking record must still exist)
    await sendBookingCancellationEmail(bookingId, booking.organization_id, refunded);
    if (notifyAdmin) {
      await sendBookingCancellationNotification(bookingId, booking.organization_id, refunded);
    }

    // 4. Delete the booking using the existing deleteBooking function
    const deleteResult = await deleteBooking(bookingId);

    if (!deleteResult.success) {
      console.error('[cancelBookingWithRefund] Delete failed:', deleteResult.error);
      return { success: false, error: deleteResult.error || 'Failed to delete booking' };
    }

    console.log('[cancelBookingWithRefund] Booking cancelled successfully, refunded:', refunded);
    return { success: true, refunded };
  } catch (error: any) {
    console.error('[cancelBookingWithRefund] Exception:', error);
    return { success: false, error: error.message };
  }
}

export async function getBookingDetails(bookingId: string) {
  try {
    const supabase = createSupabaseClient();

    // First get the booking with its session instance and template
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        session_instance:session_instances (
          *,
          template:session_templates (*)
        )
      `)
      .eq("id", bookingId)
      .single();

    // Diagnostic logging for debugging "Session not found" issues
    console.log('getBookingDetails debug:', {
      bookingId,
      hasBookingData: !!bookingData,
      hasSessionInstance: !!bookingData?.session_instance,
      hasTemplate: !!bookingData?.session_instance?.template,
      sessionInstanceId: bookingData?.session_instance_id,
      error: bookingError?.message
    })

    if (bookingError) {
      return {
        success: false,
        error: "Failed to fetch booking details"
      };
    }

    if (!bookingData) {
      return {
        success: false,
        error: "No bookings found"
      };
    }


    // Check for missing session_instance or template
    if (!bookingData.session_instance) {
      return {
        success: false,
        error: "No session instance found for this booking. It may have been deleted or is missing."
      };
    }
    if (!bookingData.session_instance.template) {
      return {
        success: false,
        error: "No session template found for this booking's session instance. It may have been deleted or is missing."
      };
    }

    // Then get the user data using clerk_user_id
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("*")
      .eq("id", bookingData.user_id)
      .single();

    if (userError) {
      return {
        success: false,
        error: "Failed to fetch user details"
      };
    }

    if (!userData) {
      return {
        success: false,
        error: "User not found"
      };
    }


    // Compute actual duration from the instance (reflects schedule-level overrides, not template default)
    const instanceDurationMinutes = Math.round(
      (new Date(bookingData.session_instance.end_time).getTime() -
        new Date(bookingData.session_instance.start_time).getTime()) / 60000
    )

    // Transform the response to match the expected format
    const response = {
      success: true,
      data: {
        booking: {
          id: bookingData.id,
          notes: bookingData.notes,
          number_of_spots: bookingData.number_of_spots,
          status: bookingData.status,
          created_at: bookingData.created_at,
          updated_at: bookingData.updated_at,
          amount_paid: bookingData.amount_paid,
          payment_status: bookingData.payment_status,
          unit_price: bookingData.unit_price,
          discount_amount: bookingData.discount_amount,
          user: {
            id: userData.id,
            email: userData.email,
            first_name: userData.first_name,
            last_name: userData.last_name,
            phone: userData.phone,
            clerk_user_id: userData.clerk_user_id
          }
        },
        session: {
          ...bookingData.session_instance.template,
          duration_minutes: instanceDurationMinutes,
        },
        startTime: new Date(bookingData.session_instance.start_time)
      }
    };

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

export async function getUserUpcomingBookings(userId: string, organizationId?: string): Promise<{ data: Booking[] | null; error: string | null }> {
  try {
    const supabase = createSupabaseServerClient()
    const now = new Date().toISOString()

    // First get the clerk_users record
    const { data: userData, error: userError } = await supabase
      .from('clerk_users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError) {
      return { data: null, error: userError.message }
    }

    if (!userData) {
      return { data: null, error: 'User not found' }
    }

    // Get the bookings with their session instances
    let query = supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        session_instance:session_instances!inner (
          id,
          start_time,
          end_time,
          session_templates!inner (
            id,
            name,
            duration_minutes,
            organization_id
          )
        )
      `)
      .eq('user_id', userData.id)
      .eq('status', 'confirmed')
      .gte('session_instance.end_time', now)

    if (organizationId) {
      query = query.eq('session_instance.session_templates.organization_id', organizationId)
    }

    const { data: bookings, error } = await query

    if (error) {
      return { data: null, error: error.message }
    }

    if (!bookings) {
      return { data: [], error: null }
    }

    // Type assertion for the nested structure
    type BookingWithSession = {
      id: string;
      number_of_spots: number;
      session_instance: {
        id: string;
        start_time: string;
        end_time: string;
        session_templates: {
          id: string;
          name: string;
          duration_minutes: number;
        };
      };
    };

    const typedBookings = bookings as unknown as BookingWithSession[];

    // Sort the bookings by start time
    const sortedBookings = typedBookings.sort((a, b) => 
      new Date(a.session_instance.start_time).getTime() - new Date(b.session_instance.start_time).getTime()
    )

    // Transform the data to match the Booking interface
    const transformedBookings = sortedBookings.map(booking => {
      const startTime = new Date(booking.session_instance.start_time)
      return {
        id: booking.id,
        sessionName: booking.session_instance.session_templates.name,
        date: startTime,
        time: startTime.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        duration: `${booking.session_instance.session_templates.duration_minutes} minutes`,
        spotsBooked: booking.number_of_spots,
        sessionId: booking.session_instance.session_templates.id,
        session_instance: {
          id: booking.session_instance.id,
          start_time: booking.session_instance.start_time,
          end_time: booking.session_instance.end_time,
          session_templates: {
            id: booking.session_instance.session_templates.id,
            name: booking.session_instance.session_templates.name,
            duration_minutes: booking.session_instance.session_templates.duration_minutes
          }
        }
      }
    })

    return { data: transformedBookings, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'An error occurred' }
  }
}

export async function getUserBookings(userId: string) {
  try {
    const supabase = createSupabaseClient();
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
}

export async function checkInBooking(bookingId: string) {
  try {

    const supabase = createSupabaseClient();

    // First verify the booking exists and get current status
    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('id', bookingId)
      .single();

    if (checkError) {
      return { success: false, error: `Failed to verify booking: ${checkError.message}` };
    }

    if (!existingBooking) {
      return { success: false, error: "Booking not found" };
    }

    // Toggle between confirmed and completed status
    const newStatus = existingBooking.status === 'confirmed' ? 'completed' : 'confirmed';

    // Update the booking status
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) {
      return { success: false, error: `Failed to update booking: ${error.message}` };
    }

    return { success: true, data: booking };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getDateChangeOptions(bookingId: string): Promise<{
  success: boolean
  data?: Array<{ id: string; start_time: string; end_time: string; available_spots: number }>
  error?: string
}> {
  try {
    const supabase = createSupabaseClient();

    // Fetch booking with its current instance and template
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        session_instance_id,
        session_instance:session_instances(
          id,
          template_id,
          template:session_templates(id, capacity)
        )
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    const instance = booking.session_instance as any;
    const templateId = instance?.template_id;
    const capacity = instance?.template?.capacity;
    const currentInstanceId = booking.session_instance_id;
    const requiredSpots = booking.number_of_spots;

    if (!templateId || !capacity) {
      return { success: false, error: 'Session template not found' };
    }

    // Fetch future instances of same template, excluding current
    const { data: instances, error: instancesError } = await supabase
      .from('session_instances')
      .select(`id, start_time, end_time, bookings(number_of_spots, status)`)
      .eq('template_id', templateId)
      .neq('id', currentInstanceId)
      .gt('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    if (instancesError) {
      return { success: false, error: 'Failed to fetch available sessions' };
    }

    // Calculate available spots, filter to those with enough capacity
    const available = (instances || []).map((inst: any) => {
      const bookedSpots = (inst.bookings || [])
        .filter((b: any) => b.status !== 'cancelled')
        .reduce((sum: number, b: any) => sum + (b.number_of_spots || 0), 0);
      return {
        id: inst.id,
        start_time: inst.start_time,
        end_time: inst.end_time,
        available_spots: capacity - bookedSpots,
      };
    }).filter((inst) => inst.available_spots >= requiredSpots);

    return { success: true, data: available };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getAdminMoveOptions(
  bookingId: string,
  fromDate: string,
  toDate: string
): Promise<{
  success: boolean
  data?: Array<{
    id: string
    start_time: string
    end_time: string
    template_name: string
    available_spots: number
  }>
  error?: string
}> {
  try {
    const supabase = createSupabaseClient();

    // Fetch booking to get org ID and current instance
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, number_of_spots, session_instance_id, organization_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    // Fetch all instances in date range for the org
    const { data: instances, error: instancesError } = await supabase
      .from('session_instances')
      .select(`
        id,
        start_time,
        end_time,
        template:session_templates(name, capacity),
        bookings(number_of_spots, status)
      `)
      .eq('organization_id', booking.organization_id)
      .neq('id', booking.session_instance_id)
      .gte('start_time', fromDate)
      .lte('start_time', toDate)
      .order('start_time', { ascending: true });

    if (instancesError) {
      return { success: false, error: 'Failed to fetch available sessions' };
    }

    const requiredSpots = booking.number_of_spots;
    const available = (instances || []).map((inst: any) => {
      const capacity = inst.template?.capacity || 0;
      const bookedSpots = (inst.bookings || [])
        .filter((b: any) => b.status !== 'cancelled')
        .reduce((sum: number, b: any) => sum + (b.number_of_spots || 0), 0);
      return {
        id: inst.id,
        start_time: inst.start_time,
        end_time: inst.end_time,
        template_name: inst.template?.name || 'Session',
        available_spots: capacity - bookedSpots,
      };
    }).filter((inst) => inst.available_spots >= requiredSpots);

    return { success: true, data: available };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function moveBookingToInstance(
  bookingId: string,
  newInstanceId: string,
  adminOverride = false
): Promise<{ success: boolean; newStartTime?: string; error?: string }> {
  try {
    const supabase = createSupabaseClient();

    // Fetch current booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        session_instance_id,
        status,
        session_instance:session_instances(template_id)
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.status !== 'confirmed') {
      return { success: false, error: 'Only confirmed bookings can be moved' };
    }

    // Fetch the target instance
    const { data: newInstance, error: instanceError } = await supabase
      .from('session_instances')
      .select(`
        id,
        template_id,
        start_time,
        template:session_templates(capacity),
        bookings(number_of_spots, status)
      `)
      .eq('id', newInstanceId)
      .single();

    if (instanceError || !newInstance) {
      return { success: false, error: 'Target session not found' };
    }

    // Must be in the future
    if (new Date(newInstance.start_time) <= new Date()) {
      return { success: false, error: 'Cannot move booking to a session in the past' };
    }

    // Non-admins: must be same template
    const currentInstance = booking.session_instance as any;
    if (!adminOverride && newInstance.template_id !== currentInstance?.template_id) {
      return { success: false, error: 'Cannot move booking to a different session type' };
    }

    // Validate capacity
    const newInstanceTyped = newInstance as any;
    const capacity = newInstanceTyped.template?.capacity || 0;
    const bookedSpots = (newInstanceTyped.bookings || [])
      .filter((b: any) => b.status !== 'cancelled')
      .reduce((sum: number, b: any) => sum + (b.number_of_spots || 0), 0);

    if (capacity - bookedSpots < booking.number_of_spots) {
      return { success: false, error: 'Not enough spots available in the selected session' };
    }

    // Update the booking's session instance
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        session_instance_id: newInstanceId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      return { success: false, error: `Failed to move booking: ${updateError.message}` };
    }

    return { success: true, newStartTime: newInstance.start_time };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// PUBLIC SESSION DATA (no auth required)
// Use these for public booking pages
// ============================================

/**
 * Get a single session template by ID (public, no auth required).
 * Use this for public booking pages.
 *
 * @param sessionId - The session template ID
 * @param startTime - Optional start time to fetch a specific instance with its bookings
 */
export async function getPublicSessionById(
  sessionId: string,
  startTime?: string
): Promise<{
  success: boolean;
  data?: SessionTemplate;
  error?: string;
}> {
  try {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      return { success: false, error: "Invalid session ID provided" };
    }

    const supabase = createSupabaseClient();

    // Allow 'open' and 'hidden' sessions to be accessed via direct link, but not 'closed'
    const { data: sessionData, error: sessionError } = await supabase
      .from('session_templates')
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        visibility,
        is_recurring,
        timezone,
        created_at,
        updated_at,
        created_by,
        organization_id,
        pricing_type,
        drop_in_price,
        drop_in_enabled,
        member_price,
        booking_instructions,
        image_url
      `)
      .eq('id', sessionId)
      .neq('visibility', 'closed')
      .single();

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }

    if (!sessionData) {
      return { success: false, error: "Session not found or not available for booking" };
    }

    // If startTime is provided, fetch the specific instance with its bookings
    let instances: any[] = [];
    if (startTime) {
      const { data: instanceData, error: instanceError } = await supabase
        .from('session_instances')
        .select(`
          id,
          template_id,
          start_time,
          end_time,
          status,
          bookings (
            id,
            number_of_spots,
            user:clerk_users!user_id (
              id,
              clerk_user_id
            )
          )
        `)
        .eq('template_id', sessionId)
        .eq('start_time', startTime)
        .maybeSingle();

      // Log instance lookup failures for debugging
      if (instanceError) {
        console.error('Instance lookup failed:', { sessionId, startTime, error: instanceError.message })
      }

      if (!instanceError && instanceData) {
        // Transform to match expected format
        const transformedInstance = {
          id: instanceData.id,
          template_id: instanceData.template_id,
          start_time: instanceData.start_time,
          end_time: instanceData.end_time,
          status: instanceData.status,
          bookings: (instanceData.bookings || []).map((booking: any) => ({
            id: booking.id,
            number_of_spots: booking.number_of_spots || 1,
            user: {
              clerk_user_id: booking.user?.clerk_user_id || ''
            }
          }))
        };
        instances = [transformedInstance];
      }
    }

    // Resolve duration from the authoritative source (schedule/one-off-date), with instance
    // end_time as fallback. Never rely on session_templates.duration_minutes for display.
    let effectiveDurationMinutes: number | null = null;

    if (startTime) {
      const tz = (sessionData as any).timezone as string || SAUNA_TIMEZONE;
      const localDate = utcToLocal(new Date(startTime), tz);
      const localTimeStr = format(localDate, 'HH:mm');

      if (sessionData.is_recurring) {
        // Find the matching schedule by day-of-week and time in the session's timezone
        const localDayOfWeek = getDay(localDate); // 0=Sunday … 6=Saturday
        const { data: schedules } = await supabase
          .from('session_schedules')
          .select('day_of_week, time, duration_minutes')
          .eq('session_template_id', sessionId)
          .eq('is_active', true)
          .eq('day_of_week', localDayOfWeek);

        const matchingSchedule = schedules?.find(
          s => s.time.substring(0, 5) === localTimeStr
        );
        if (matchingSchedule?.duration_minutes != null) {
          effectiveDurationMinutes = matchingSchedule.duration_minutes;
        }
      } else {
        // Find the matching one-off date by local date and time
        const localDateStr = format(localDate, 'yyyy-MM-dd');
        const { data: oneOffDates } = await supabase
          .from('session_one_off_dates')
          .select('date, time, duration_minutes')
          .eq('template_id', sessionId)
          .eq('date', localDateStr);

        const matchingOneOff = oneOffDates?.find(
          d => d.time.substring(0, 5) === localTimeStr
        );
        if (matchingOneOff?.duration_minutes != null) {
          effectiveDurationMinutes = matchingOneOff.duration_minutes;
        }
      }

      // Fall back to instance end_time if no schedule duration found
      if (effectiveDurationMinutes === null && instances.length > 0) {
        effectiveDurationMinutes = Math.round(
          (new Date(instances[0].end_time).getTime() - new Date(instances[0].start_time).getTime()) / 60000
        );
      }
    }

    return {
      success: true,
      data: {
        ...sessionData,
        ...(effectiveDurationMinutes !== null && { duration_minutes: effectiveDurationMinutes }),
        instances
      } as unknown as SessionTemplate
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if a user has an existing booking for a session instance.
 * Returns the booking if found, null otherwise.
 */
/**
 * Get the internal Supabase user ID for a Clerk user.
 * Used to identify current user's bookings in the calendar.
 */
export async function getInternalUserId(
  clerkUserId: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('clerk_users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, userId: data?.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if a Clerk user has been synced to Supabase.
 * Used during sign-up flow to wait for webhook sync.
 */
export async function checkClerkUserSynced(
  clerkUserId: string,
  email: string
): Promise<{ success: boolean; synced: boolean; error?: string }> {
  try {
    const supabase = createSupabaseClient();

    // Check if user exists with matching email AND clerk_user_id AND has an organization_id
    const { data, error } = await supabase
      .from("clerk_users")
      .select("id, organization_id")
      .eq("email", email)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (error) {
      return { success: false, synced: false, error: error.message };
    }

    // User must exist AND have an organization_id to be considered synced
    const isSynced = !!(data?.id && data?.organization_id);

    return { success: true, synced: isSynced };
  } catch (error: any) {
    return { success: false, synced: false, error: error.message };
  }
}

/**
 * Check if a user has an existing booking for a session instance.
 * Returns the booking if found, null otherwise.
 */
export async function checkUserExistingBooking(
  clerkUserId: string,
  sessionTemplateId: string,
  startTime: string
): Promise<{
  success: boolean;
  booking?: { id: string; number_of_spots: number; notes: string | null };
  error?: string;
}> {
  try {
    const supabase = createSupabaseClient();

    // Look up user ID and instance ID in parallel (they're independent)
    const [{ data: userData }, { data: instance }] = await Promise.all([
      supabase
        .from('clerk_users')
        .select('id')
        .eq('clerk_user_id', clerkUserId)
        .single(),
      supabase
        .from('session_instances')
        .select('id')
        .eq('template_id', sessionTemplateId)
        .eq('start_time', startTime)
        .single(),
    ]);

    if (!userData) {
      return { success: true, booking: undefined }; // User not found in DB yet, no booking
    }

    if (!instance) {
      return { success: true, booking: undefined }; // No instance found
    }

    // Check for existing booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, number_of_spots, notes')
      .eq('user_id', userData.id)
      .eq('session_instance_id', instance.id)
      .eq('status', 'confirmed')
      .maybeSingle();

    if (bookingError) {
      return { success: false, error: bookingError.message };
    }

    return { success: true, booking: booking || undefined };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// ADMIN SESSION DATA (server-side, bypasses RLS)
// Use these for admin pages
// ============================================

/**
 * Get session instances with bookings for admin (bypasses RLS)
 * This is a server action that can be called from client components
 */
export async function getAdminSessionsForDateRange(
  startDate: string,
  endDate: string,
  organizationId?: string
): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const supabase = createSupabaseClient();

    // Get the organization from:
    // 1. Explicit parameter
    // 2. Request headers (set by middleware)
    // 3. User's primary organization
    let orgId = organizationId;

    if (!orgId) {
      // Try to get from request headers (set by middleware for /[slug]/ routes)
      const { getTenantFromHeaders } = await import('@/lib/tenant-utils');
      const tenant = await getTenantFromHeaders();
      orgId = tenant?.organizationId;
    }

    if (!orgId) {
      // Fall back to user's primary organization
      const { data: userData } = await supabase
        .from('clerk_users')
        .select('organization_id')
        .eq('clerk_user_id', userId)
        .single();

      orgId = userData?.organization_id;
    }

    if (!orgId) {
      return { success: false, error: "No organization specified" };
    }

    const { data: instances, error } = await supabase
      .from('session_instances')
      .select(`
        *,
        template:session_templates(*),
        bookings(
          *,
          user:clerk_users(*)
        )
      `)
      .eq('organization_id', orgId)
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .order('start_time', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: instances || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export interface AdminBooking {
  id: string;
  number_of_spots: number;
  status: string;
  amount_paid: number | null;
  booked_at: string;
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    role: string | null;
  };
  session_instance: {
    id: string;
    start_time: string;
    end_time: string;
    template: {
      id: string;
      name: string;
    };
  };
  is_member: boolean;
}

export interface GetAdminBookingsResult {
  success: boolean;
  data?: AdminBooking[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

export async function getAdminBookingsForOrg(
  options?: {
    search?: string;
    page?: number;
    pageSize?: number;
    timeFilter?: 'upcoming' | 'past';
  }
): Promise<GetAdminBookingsResult> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    const supabase = createSupabaseClient();

    // Get organization from headers
    const { getTenantFromHeaders } = await import('@/lib/tenant-utils');
    const tenant = await getTenantFromHeaders();
    const orgId = tenant?.organizationId;

    if (!orgId) {
      return { success: false, error: "No organization specified" };
    }

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 25;
    const offset = (page - 1) * pageSize;
    const search = options?.search?.trim().toLowerCase() || "";

    // Build the query for bookings
    let query = supabase
      .from('bookings')
      .select(`
        id,
        number_of_spots,
        status,
        amount_paid,
        booked_at,
        user_id,
        session_instance_id,
        user:clerk_users(
          id,
          first_name,
          last_name,
          email,
          role
        ),
        session_instance:session_instances(
          id,
          start_time,
          end_time,
          template:session_templates(
            id,
            name
          )
        )
      `, { count: 'exact' })
      .eq('organization_id', orgId)
      .order('booked_at', { ascending: false });

    // Fetch all bookings first (search is done client-side due to Supabase limitations with nested relations)
    const { data: bookings, error, count } = await query;

    console.log('[getAdminBookingsForOrg] Query result:', {
      orgId,
      bookingsCount: bookings?.length,
      error: error?.message,
      firstBooking: bookings?.[0]
    });

    if (error) {
      console.error('[getAdminBookingsForOrg] Query error:', error);
      return { success: false, error: error.message };
    }

    // Get membership status for all users in the results
    const userIds = [...new Set((bookings || []).map((b: any) => b.user?.id).filter(Boolean))];

    let memberships: Record<string, boolean> = {};
    if (userIds.length > 0) {
      const { data: membershipData } = await supabase
        .from('user_memberships')
        .select('user_id, status, current_period_end')
        .eq('organization_id', orgId)
        .in('user_id', userIds);

      if (membershipData) {
        for (const m of membershipData) {
          const isActive = m.status === 'active' ||
            (m.status === 'cancelled' && m.current_period_end && new Date(m.current_period_end) > new Date());
          memberships[m.user_id] = isActive;
        }
      }
    }

    // Transform data
    let transformedBookings: AdminBooking[] = (bookings || []).map((b: any) => ({
      id: b.id,
      number_of_spots: b.number_of_spots,
      status: b.status,
      amount_paid: b.amount_paid,
      booked_at: b.booked_at,
      user: b.user,
      session_instance: b.session_instance,
      is_member: memberships[b.user?.id] || false
    }));

    // Apply search filter (client-side due to Supabase limitations with nested relations)
    if (search) {
      transformedBookings = transformedBookings.filter((b) => {
        const firstName = b.user?.first_name?.toLowerCase() || "";
        const lastName = b.user?.last_name?.toLowerCase() || "";
        const email = b.user?.email?.toLowerCase() || "";
        const fullName = `${firstName} ${lastName}`.trim();
        return (
          fullName.includes(search) ||
          firstName.includes(search) ||
          lastName.includes(search) ||
          email.includes(search)
        );
      });
    }

    // Apply time filter and sort by session date
    const timeFilter = options?.timeFilter ?? 'upcoming';
    const now = new Date();
    if (timeFilter === 'upcoming') {
      transformedBookings = transformedBookings.filter((b) =>
        b.session_instance?.start_time ? new Date(b.session_instance.start_time) >= now : false
      );
      // Sort ascending: soonest first
      transformedBookings.sort((a, b) =>
        new Date(a.session_instance?.start_time || 0).getTime() -
        new Date(b.session_instance?.start_time || 0).getTime()
      );
    } else {
      transformedBookings = transformedBookings.filter((b) =>
        b.session_instance?.start_time ? new Date(b.session_instance.start_time) < now : false
      );
      // Sort descending: most recent first
      transformedBookings.sort((a, b) =>
        new Date(b.session_instance?.start_time || 0).getTime() -
        new Date(a.session_instance?.start_time || 0).getTime()
      );
    }

    // Get total before pagination
    const totalCount = transformedBookings.length;

    // Apply pagination
    transformedBookings = transformedBookings.slice(offset, offset + pageSize);

    return {
      success: true,
      data: transformedBookings,
      total: totalCount,
      page,
      pageSize
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}