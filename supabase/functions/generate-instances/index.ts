import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { formatInTimeZone, zonedTimeToUtc, utcToZonedTime } from "https://cdn.skypack.dev/date-fns-tz@2.0.0";
import { addDays, format, parseISO, startOfDay, formatISO } from "https://esm.sh/date-fns@2.30.0";
import { addMinutes, getDay, set, addMonths } from "https://esm.sh/date-fns@2.30.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from '../_shared/cors.ts';

// Debug logging
console.log("Function starting...");
console.log("ENVIRONMENT:", Deno.env.get("ENVIRONMENT") || "development");
console.log("DB_URL:", Deno.env.get("DB_URL") ? "Set" : "Not set");
console.log("SERVICE_ROLE_KEY:", Deno.env.get("SERVICE_ROLE_KEY") ? "Set" : "Not set");
console.log("TIMEZONE:", Deno.env.get("TIMEZONE") ? "Set" : "Not set");

const SAUNA_TIMEZONE = Deno.env.get("TIMEZONE") || 'Europe/London';
const DB_URL = Deno.env.get("DB_URL");
if (!DB_URL) {
  throw new Error("DB_URL environment variable is required");
}

console.log("Debug - Environment variables:", {
  DB_URL: Deno.env.get("DB_URL"),
  ENVIRONMENT: Deno.env.get("ENVIRONMENT"),
  TIMEZONE: Deno.env.get("TIMEZONE")
});

const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

if (!SERVICE_ROLE_KEY) {
  throw new Error("SERVICE_ROLE_KEY environment variable is required");
}

// Add UUID validation function
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

interface SessionSchedule {
  id: string;
  day_of_week: number;
  time: string;
  start_time_local: string;
  is_active: boolean;
  duration_minutes?: number | null;
}

interface SessionOneOffDate {
  id: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  duration_minutes: number | null;
}

interface SessionTemplate {
  id: string;
  name: string;
  is_recurring: boolean;
  visibility: string;
  session_schedules: SessionSchedule[];
  session_one_off_dates: SessionOneOffDate[];
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  duration_minutes: number;
  organization_id: string;
}

// Helper function to convert local time to UTC
function localToUTC(date: Date, timezone: string): Date {
  try {
    // Use zonedTimeToUtc to properly convert from local timezone to UTC
    const utcDate = zonedTimeToUtc(date, timezone);
    console.log('Timezone conversion:', {
      input: date.toISOString(),
      timezone,
      utcDate: utcDate.toISOString()
    });
    return utcDate;
  } catch (error) {
    console.error('Error in localToUTC:', {
      error,
      date: date.toISOString(),
      timezone
    });
    throw error;
  }
}

// Helper function to convert UTC to local time
function utcToLocal(date: Date, timezone: string): Date {
  try {
    const localDate = utcToZonedTime(date, timezone);
    console.log('UTC to local conversion:', {
      input: date.toISOString(),
      timezone,
      localDate: localDate.toISOString()
    });
    return localDate;
  } catch (error) {
    console.error('Error in utcToLocal:', {
      error,
      date: date.toISOString(),
      timezone
    });
    throw error;
  }
}

// Update CORS headers based on environment
const getCorsHeaders = (requestOrigin: string | null) => {
  const isDevelopment = Deno.env.get("ENVIRONMENT") === "development";
  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];
  
  // Always allow localhost in development
  if (isDevelopment) {
    allowedOrigins.push("http://localhost:3000");
  }

  // If the request origin is in our allowed origins, use it
  // Otherwise, use the first allowed origin as fallback
  const origin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

// Create a custom serve function that bypasses auth
const serveWithoutAuth = (handler: (req: Request) => Promise<Response>) => {
  return serve(async (req) => {
    const requestOrigin = req.headers.get("origin");
    
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: getCorsHeaders(requestOrigin) });
    }

    try {
      const response = await handler(req);
      // Ensure CORS headers are added to all responses
      const headers = new Headers(response.headers);
      Object.entries(getCorsHeaders(requestOrigin)).forEach(([key, value]) => {
        headers.set(key, value);
      });
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error("Error in handler:", error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
        {
          status: 500,
          headers: { ...getCorsHeaders(requestOrigin), 'Content-Type': 'application/json' }
        }
      );
    }
  });
};

serveWithoutAuth(async (req) => {
  console.log("Request received");
  
  // Check if a specific template_id is passed in the request body
  let specificTemplateIdToProcess: string | null = null;
  if (req.body) {
    try {
      const body = await req.json();
      if (body && body.template_id_to_process) {
        specificTemplateIdToProcess = body.template_id_to_process;
        console.log(`Received request to process specific template ID: ${specificTemplateIdToProcess}`);
        
        // Validate UUID format if we have a template ID
        if (specificTemplateIdToProcess && !isValidUUID(specificTemplateIdToProcess)) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid template ID format. Expected a valid UUID.',
              received: specificTemplateIdToProcess
            }),
            { 
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                ...getCorsHeaders(null)
              }
            }
          );
        }
      }
    } catch (e: unknown) {
      console.warn("Could not parse request body for specific template ID:", e instanceof Error ? e.message : String(e));
    }
  }

  try {
    console.log("Using Supabase client with URL:", DB_URL);
    const supabaseClient = createClient(DB_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    });

    // Query for templates
    console.log("[Info] Querying for templates...");
    
    const query = supabaseClient
      .from("session_templates")
      .select(`
        id,
        name,
        is_recurring,
        visibility,
        recurrence_start_date,
        recurrence_end_date,
        duration_minutes,
        organization_id,
        session_schedules (
          id,
          time,
          day_of_week,
          is_active,
          duration_minutes
        ),
        session_one_off_dates (
          id,
          date,
          time,
          duration_minutes
        )
      `)
      .eq("id", specificTemplateIdToProcess);

    const result = await query;
    const templates = result.data as SessionTemplate[];
    const error = result.error;

    if (error) {
      console.error("[Error] Database query failed:", error);
      return new Response(
        JSON.stringify({ error: "Failed to query templates", details: error }),
        { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(null) } }
      );
    }

    if (!templates || templates.length === 0) {
      console.error("[Error] No templates found");
      return new Response(
        JSON.stringify({ error: "No templates found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...getCorsHeaders(null) } }
      );
    }

    console.log("[Info] Raw query response:", { templates, error });

    // Process templates
    if (templates) {
      for (const template of templates) {
        console.log(`[Info] Processing specific template: ${template.id}. Handling future instances...`);
        console.log('Template details:', {
          is_recurring: template.is_recurring,
          visibility: template.visibility,
          recurrence_start_date: template.recurrence_start_date,
          recurrence_end_date: template.recurrence_end_date,
          schedules: template.session_schedules,
          duration_minutes: template.duration_minutes
        });

        // Fetch all existing instances for this template in one query
        const { data: existingInstances, error: fetchError } = await supabaseClient
          .from("session_instances")
          .select("start_time")
          .eq("template_id", template.id);

        if (fetchError) {
          console.error(`Error fetching existing instances: ${fetchError.message}`);
          continue;
        }

        const existingStartTimes = new Set(
          (existingInstances || []).map((i: { start_time: string }) => i.start_time)
        );

        // Collect all instances to create
        const instancesToInsert: Array<{
          template_id: string;
          start_time: string;
          end_time: string;
          status: string;
          organization_id: string;
        }> = [];

        if (template.is_recurring) {
          // Recurring: generate one instance per matching weekday in the date range
          if (!template.session_schedules || template.session_schedules.length === 0) {
            console.log(`Recurring template ${template.id} has no schedules.`);
            continue;
          }

          const generationStartDate = template.recurrence_start_date
            ? parseISO(template.recurrence_start_date)
            : new Date();
          const generationEndDate = template.recurrence_end_date
            ? parseISO(template.recurrence_end_date)
            : addMonths(new Date(), 3);

          console.log('Generation date range:', {
            start: formatISO(generationStartDate),
            end: formatISO(generationEndDate),
            daysToGenerate: Math.ceil((generationEndDate.getTime() - generationStartDate.getTime()) / (1000 * 60 * 60 * 24))
          });

          let currentDate = generationStartDate;
          const scheduleDays = template.session_schedules.map((s: SessionSchedule) => s.day_of_week);

          while (!scheduleDays.includes(getDay(currentDate))) {
            currentDate = addDays(currentDate, 1);
          }

          while (currentDate <= generationEndDate) {
            const currentDayOfWeekInteger = getDay(currentDate);

            for (const schedule of template.session_schedules) {
              if (schedule.day_of_week === currentDayOfWeekInteger) {
                const [hours, minutes] = schedule.time.split(':').map(Number);

                const localDateWithTime = set(currentDate, {
                  hours,
                  minutes,
                  seconds: 0,
                  milliseconds: 0
                });

                const instanceStartTimeUTC = localToUTC(localDateWithTime, SAUNA_TIMEZONE);
                const effectiveDuration = schedule.duration_minutes || template.duration_minutes;
                const instanceEndTimeUTC = addMinutes(instanceStartTimeUTC, effectiveDuration);
                const startTimeISO = formatISO(instanceStartTimeUTC);

                if (!existingStartTimes.has(startTimeISO)) {
                  instancesToInsert.push({
                    template_id: template.id,
                    start_time: startTimeISO,
                    end_time: formatISO(instanceEndTimeUTC),
                    status: "scheduled",
                    organization_id: template.organization_id
                  });
                }
              }
            }
            currentDate = addDays(currentDate, 1);
          }
        } else {
          // Date-type (one-off): generate one instance per entry in session_one_off_dates
          if (!template.session_one_off_dates || template.session_one_off_dates.length === 0) {
            console.log(`Date-type template ${template.id} has no one-off dates.`);
            continue;
          }

          for (const entry of template.session_one_off_dates) {
            const [hours, mins] = entry.time.split(':').map(Number);
            const localDate = set(parseISO(entry.date), {
              hours,
              minutes: mins,
              seconds: 0,
              milliseconds: 0
            });
            const instanceStartTimeUTC = localToUTC(localDate, SAUNA_TIMEZONE);
            const effectiveDuration = entry.duration_minutes ?? template.duration_minutes;
            const instanceEndTimeUTC = addMinutes(instanceStartTimeUTC, effectiveDuration);
            const startTimeISO = formatISO(instanceStartTimeUTC);

            if (!existingStartTimes.has(startTimeISO)) {
              instancesToInsert.push({
                template_id: template.id,
                start_time: startTimeISO,
                end_time: formatISO(instanceEndTimeUTC),
                status: "scheduled",
                organization_id: template.organization_id
              });
            }
          }
        }

        // Bulk insert all new instances
        let instancesCreated = 0;
        if (instancesToInsert.length > 0) {
          const { error: insertError } = await supabaseClient
            .from("session_instances")
            .insert(instancesToInsert);

          if (insertError) {
            console.error(`Error bulk inserting instances for template ${template.id}:`, insertError);
          } else {
            instancesCreated = instancesToInsert.length;
          }
        }
        console.log(`Finished processing template ${template.id}. Created ${instancesCreated} instances.`);
      }
    }

    console.log(`Successfully processed all templates`);
    return new Response(JSON.stringify({
      message: "Instance generation complete/triggered.",
      processedTemplateId: specificTemplateIdToProcess
    }), {
      headers: { 
        "Content-Type": "application/json",
        ...getCorsHeaders(null)
      },
      status: 200
    });
  } catch (error) {
    console.error("Error in generate-instances function:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error occurred",
      processedTemplateId: specificTemplateIdToProcess
    }), {
      headers: { 
        "Content-Type": "application/json",
        ...getCorsHeaders(null)
      },
      status: 500
    });
  }
});

async function processTemplate(template: SessionTemplate, supabase: SupabaseClient) {
  console.log("Processing template:", template.name, "(ID:", template.id, ")")
  
  // Add retry logic for fetching schedules
  let retryCount = 0;
  const maxRetries = 3;
  let schedules: SessionSchedule[] = [];
  
  while (retryCount < maxRetries) {
    try {
      // Query for schedules
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('session_schedules')
        .select('*')
        .eq('session_template_id', template.id);

      if (scheduleError) {
        console.error("Error fetching schedules:", scheduleError);
        throw scheduleError;
      }

      schedules = scheduleData || [];
      
      if (schedules.length > 0) {
        console.log("Found schedules:", schedules);
        break;
      }

      if (retryCount < maxRetries - 1) {
        console.log(`No schedules found, retrying in 2 seconds... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      retryCount++;
    } catch (error) {
      console.error("Error in schedule fetch attempt:", error);
      if (retryCount < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        retryCount++;
      } else {
        throw error;
      }
    }
  }

  if (schedules.length === 0) {
    console.log(`Template ${template.id} has no schedules after ${maxRetries} attempts.`);
    return;
  }

  // Rest of the existing processTemplate function...
  // ... existing code ...
}