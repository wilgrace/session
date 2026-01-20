"use server"

import { SessionTemplate, SessionSchedule } from "@/types/session"
import { auth, currentUser } from "@clerk/nextjs/server"
import { mapDayStringToInt, mapIntToDayString } from "@/lib/day-utils"
import { ensureClerkUser } from "./clerk"
import { Booking } from "@/types/booking"
import { createSupabaseServerClient, getUserContextWithClient, UserContext } from "@/lib/supabase"

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

interface CreateSessionTemplateParams {
  name: string
  description: string | null
  capacity: number
  duration_minutes: number
  is_open: boolean
  is_recurring: boolean
  one_off_start_time: string | null
  one_off_date: string | null
  recurrence_start_date: string | null
  recurrence_end_date: string | null
  created_by: string
  schedules?: SessionSchedule[]
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
  is_open?: boolean
  is_recurring?: boolean
  one_off_start_time?: string | null
  one_off_date?: string | null
  recurrence_start_date?: string | null
  recurrence_end_date?: string | null
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

interface DBSessionTemplate {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  duration_minutes: number;
  is_open: boolean;
  is_recurring: boolean;
  one_off_start_time: string | null;
  one_off_date: string | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  organization_id: string;
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

    // Create the template first
    const { data, error } = await supabase
      .from("session_templates")
      .insert({
        name: params.name,
        description: params.description,
        capacity: params.capacity,
        duration_minutes: params.duration_minutes,
        is_open: params.is_open,
        is_recurring: params.is_recurring,
        one_off_start_time: params.one_off_start_time,
        one_off_date: params.one_off_date,
        recurrence_start_date: params.recurrence_start_date,
        recurrence_end_date: params.recurrence_end_date,
        created_by: userData.id,
        organization_id: userData.organization_id
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

    // Trigger instance generation for recurring templates
    if (params.is_recurring) {
      try {
        const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
        const functionUrl = IS_DEVELOPMENT 
          ? 'http://localhost:54321/functions/v1/generate-instances'
          : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-instances`;

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
          },
          body: JSON.stringify({ template_id_to_process: data.id }),
        });

        if (!response.ok) {
        }
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
          is_active: true
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

export async function getSessions(): Promise<{ data: SessionTemplate[] | null; error: string | null }> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { data: null, error: "No user ID from Clerk" }
    }

    const supabase = createSupabaseClient()

    // Get the user's clerk_users record (use maybeSingle to handle missing users)
    const { data: userData, error: userError } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("clerk_user_id", userId)
      .maybeSingle()


    if (userError) {
      return { data: null, error: `Failed to get clerk user: ${userError.message} (code: ${userError.code})` }
    }

    // If user doesn't exist, create them
    let clerkUserId: string
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
    }

    // Get templates
    const { data: templates, error: templatesError } = await supabase
      .from("session_templates")
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        is_open,
        is_recurring,
        one_off_start_time,
        one_off_date,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id
      `)
      .eq('created_by', clerkUserId)
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
        time
      `)
      .in('session_template_id', templateIds)

    if (schedulesError) {
      return { data: null, error: schedulesError.message }
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
        is_open: template.is_open,
        is_recurring: template.is_recurring ?? false,
        one_off_start_time: template.one_off_start_time,
        one_off_date: template.one_off_date,
        recurrence_start_date: template.recurrence_start_date,
        recurrence_end_date: template.recurrence_end_date,
        created_at: template.created_at,
        updated_at: template.updated_at,
        created_by: template.created_by,
        organization_id: template.organization_id,
        schedules: Object.values(scheduleGroups),
        instances: transformedInstances
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
        is_open,
        is_recurring,
        one_off_start_time,
        one_off_date,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id
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
        time
      `)
      .eq("session_template_id", id);

    if (schedulesError) {
      return { data: null, error: schedulesError.message };
    }

    // Finally get the instances
    const { data: instances, error: instancesError } = await supabase
      .from("session_instances")
      .select(`
        id,
        template_id,
        start_time,
        end_time,
        status
      `)
      .eq("template_id", id);

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
      .select("id")
      .eq("clerk_user_id", userId)
      .single()

    if (userError) {
      return { success: false, error: "Failed to get clerk user" }
    }

    if (!userData) {
      return { success: false, error: "No clerk user found" }
    }

    // Only allow update if the user is the creator
    const { data: template, error: fetchError } = await supabase
      .from("session_templates")
      .select("created_by")
      .eq("id", params.id)
      .single()

    if (fetchError || !template) {
      return { success: false, error: "Template not found" }
    }
    if (template.created_by !== userData.id) {
      return { success: false, error: "Unauthorized: You can only update your own templates" }
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


    // Get the session template to verify it exists and is open
    const { data: template, error: templateError } = await supabase
      .from("session_templates")
      .select("duration_minutes, is_open, organization_id")
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


    if (!template.is_open) {
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

    // Get all open templates
    const { data: templates, error: templatesError } = await supabase
      .from("session_templates")
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        is_open,
        is_recurring,
        one_off_start_time,
        one_off_date,
        recurrence_start_date,
        recurrence_end_date,
        created_at,
        updated_at,
        created_by,
        organization_id
      `)
      .eq('is_open', true)
      .order("created_at", { ascending: false })

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
    
    const { data: schedules, error: schedulesError } = await supabase
      .from("session_schedules")
      .select(`
        id,
        session_template_id,
        day_of_week,
        is_active,
        created_at,
        updated_at,
        time
      `)
      .in('session_template_id', templateIds)

    if (schedulesError) {
      return { data: null, error: `Schedules query failed: ${schedulesError.message}` }
    }

    // Check for recurring templates that need instances generated
    // Generate instances for templates that have no instances in the next 3 months
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

    const recurringTemplates = templates.filter(t => t.is_recurring)
    const recurringTemplateIds = recurringTemplates.map(t => t.id)

    // Build a Set of template IDs that have schedules for O(1) lookup
    const templatesWithSchedules = new Set(schedules?.map(s => s.session_template_id) || [])

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

    // Find templates that need generation: recurring + has schedules + no instances
    const templatesNeedingGeneration = recurringTemplateIds.filter(
      id => templatesWithSchedules.has(id) && !templatesWithInstances.has(id)
    )

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
          }).catch(err => {
          })
        )
      ).catch(err => {
      })
      
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

    // Create a new Supabase client with service role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return { success: false, error: "Missing required Supabase environment variables" };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // First verify the booking exists
    const { data: existingBooking, error: checkError } = await supabase
      .from('bookings')
      .select('id, user_id, session_instance_id')
      .eq('id', booking_id)
      .single();


    if (checkError) {
      return { success: false, error: `Failed to verify booking: ${checkError.message}` };
    }

    if (!existingBooking) {
      return { success: false, error: "Booking not found" };
    }

    // Now delete the booking
    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .eq('id', booking_id);


    if (deleteError) {
      return { success: false, error: `Failed to delete booking: ${deleteError.message}` };
    }

    return { success: true };
  } catch (error: any) {
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
          user: {
            id: userData.id,
            email: userData.email,
            first_name: userData.first_name,
            last_name: userData.last_name,
            phone: userData.phone,
            clerk_user_id: userData.clerk_user_id
          }
        },
        session: bookingData.session_instance.template,
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

export async function getUserUpcomingBookings(userId: string): Promise<{ data: Booking[] | null; error: string | null }> {
  try {
    const supabase = createSupabaseClient()
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
    const { data: bookings, error } = await supabase
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
            duration_minutes
          )
        )
      `)
      .eq('user_id', userData.id)
      .eq('status', 'confirmed')
      .gte('session_instance.end_time', now)

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

// ============================================
// PUBLIC SESSION DATA (no auth required)
// Use these for public booking pages
// ============================================

/**
 * Get a single session template by ID (public, no auth required).
 * Use this for public booking pages.
 */
export async function getPublicSessionById(sessionId: string): Promise<{
  success: boolean;
  data?: SessionTemplate;
  error?: string;
}> {
  try {
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      return { success: false, error: "Invalid session ID provided" };
    }

    const supabase = createSupabaseClient();

    const { data: sessionData, error: sessionError } = await supabase
      .from('session_templates')
      .select(`
        id,
        name,
        description,
        capacity,
        duration_minutes,
        is_open,
        is_recurring,
        created_at,
        updated_at,
        created_by,
        organization_id
      `)
      .eq('id', sessionId)
      .eq('is_open', true)
      .single();

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }

    if (!sessionData) {
      return { success: false, error: "Session template not found or not open for booking" };
    }

    return { success: true, data: sessionData as unknown as SessionTemplate };
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

    const { data, error } = await supabase
      .from("clerk_users")
      .select("id")
      .eq("email", email)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (error) {
      return { success: false, synced: false, error: error.message };
    }

    return { success: true, synced: !!data?.id };
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

    // Get user's Supabase ID
    const { data: userData, error: userError } = await supabase
      .from('clerk_users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (userError || !userData) {
      return { success: true, booking: undefined }; // User not found in DB yet, no booking
    }

    // Find the session instance
    const { data: instance, error: instanceError } = await supabase
      .from('session_instances')
      .select('id')
      .eq('template_id', sessionTemplateId)
      .eq('start_time', startTime)
      .single();

    if (instanceError || !instance) {
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