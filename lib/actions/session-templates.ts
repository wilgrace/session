import { revalidatePath } from 'next/cache';
import { NewSessionTemplate, NewSessionSchedule } from '@/lib/db/schema';
import { createClient } from '@supabase/supabase-js';

// These should come from your environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

export async function saveSessionTemplate(
  templateData: NewSessionTemplate,
  schedulesData: NewSessionSchedule[],
  userId: string,
  templateIdToUpdate?: string,
) {
  // Basic validation
  if (!userId) {
    return { success: false, error: 'User not authenticated.' };
  }
  if (!templateData.name || !templateData.durationMinutes || templateData.durationMinutes <= 0) {
    return { success: false, error: 'Invalid template data.' };
  }

  let savedTemplateId: string;
  let isNewTemplate = false;

  try {
    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Fetch the user's organization_id
    const { data: userData, error: userError } = await supabase
      .from('clerk_users')
      .select('organization_id')
      .eq('id', userId)
      .single();
    if (userError || !userData?.organization_id) {
      return { success: false, error: 'Could not find user organization.' };
    }
    const orgId = userData.organization_id;

    if (templateIdToUpdate) {
      // Update existing template
      const { data: updated, error: updateError } = await supabase
        .from('session_templates')
        .update({
          ...templateData,
          created_by: userId,
          organization_id: orgId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateIdToUpdate)
        .select('id')
        .single();

      if (updateError || !updated) {
        return { success: false, error: 'Failed to update template or template not found.' };
      }
      savedTemplateId = updated.id;
    } else {
      // Create new template
      const { data: newTemplate, error: createError } = await supabase
        .from('session_templates')
        .insert({
          ...templateData,
          created_by: userId,
          organization_id: orgId,
        })
        .select('id')
        .single();

      if (createError || !newTemplate) {
        return { success: false, error: 'Failed to create template.' };
      }
      savedTemplateId = newTemplate.id;
      isNewTemplate = true;
    }

    // --- Manage Schedules ---
    // Delete existing schedules
    const { error: deleteError } = await supabase
      .from('session_schedules')
      .delete()
      .eq('session_template_id', savedTemplateId);

    if (deleteError) {
      console.error('Error deleting existing schedules:', deleteError);
    }

    // Insert new schedules
    if (schedulesData && schedulesData.length > 0) {
      const schedulesToInsert = schedulesData.map((schedule) => ({
        ...schedule,
        session_template_id: savedTemplateId,
        organization_id: orgId,
      }));
      
      const { error: insertError } = await supabase
        .from('session_schedules')
        .insert(schedulesToInsert);

      if (insertError) {
        console.error('Error inserting new schedules:', insertError);
      }
    }

    // --- Trigger Instance Generation ---
    console.log(`[saveSessionTemplate] Triggering instance generation for template ID: ${savedTemplateId}`);

    let instanceGenerationResult;
    if (IS_DEVELOPMENT) {
      // Call local Edge Function
      const localFunctionUrl = 'http://localhost:54321/functions/v1/generate-instances';
      try {
        const response = await fetch(localFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ template_id_to_process: savedTemplateId }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[saveSessionTemplate] Error calling local edge function:", errorText);
          instanceGenerationResult = { error: errorText };
        } else {
          const result = await response.json();
          console.log("[saveSessionTemplate] Local edge function invoked successfully:", result);
          instanceGenerationResult = result;
        }
      } catch (e) {
        console.error("[saveSessionTemplate] Failed to call local edge function:", e);
        instanceGenerationResult = { error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      // Call remote Edge Function using Supabase client
      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        'generate-instances',
        {
          body: { template_id_to_process: savedTemplateId },
        }
      );

      if (functionError) {
        console.error(
          `[saveSessionTemplate] Error invoking remote Edge Function for template ${savedTemplateId}:`,
          functionError
        );
        instanceGenerationResult = { error: functionError.message };
      } else {
        console.log(
          `[saveSessionTemplate] Remote Edge Function invoked successfully for template ${savedTemplateId}. Response:`,
          functionData
        );
        instanceGenerationResult = functionData;
      }
    }

    // Revalidate paths to ensure fresh data is shown
    revalidatePath('/admin/calendar');
    revalidatePath('/booking');

    return {
      success: true,
      templateId: savedTemplateId,
      message: `Session template ${isNewTemplate ? 'created' : 'updated'} successfully. Instance generation ${instanceGenerationResult?.error ? 'failed' : 'triggered'}.`,
    };

  } catch (error: any) {
    console.error('[saveSessionTemplate] Error:', error);
    return { success: false, error: `An unexpected error occurred: ${error.message}` };
  }
} 