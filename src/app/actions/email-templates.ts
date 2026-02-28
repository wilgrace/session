'use server';

import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getUserRoleForOrg, getTenantFromHeaders } from '@/lib/tenant-utils';
import { EMAIL_TEMPLATE_DEFAULTS, ALL_EMAIL_TYPES } from '@/lib/email-defaults';
import type { OrgEmailTemplate, EmailTemplateType } from '@/lib/db/schema';

/** Map raw Supabase snake_case row → camelCase OrgEmailTemplate */
function mapTemplate(row: Record<string, unknown>): OrgEmailTemplate {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    type: row.type as string,
    subject: row.subject as string,
    content: row.content as string,
    replyTo: row.reply_to as string | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as unknown as Date,
    updatedAt: row.updated_at as unknown as Date,
  };
}

/**
 * Get all email templates for an organization.
 * Returns all 3 types; seeds defaults if none exist.
 */
export async function getEmailTemplates(organizationId?: string): Promise<{
  success: boolean;
  data?: OrgEmailTemplate[];
  error?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Not authenticated' };

    let orgId = organizationId;
    if (!orgId) {
      const tenant = await getTenantFromHeaders();
      if (!tenant) return { success: false, error: 'Organization context not found' };
      orgId = tenant.organizationId;
    }

    const role = await getUserRoleForOrg(userId, orgId);
    if (role !== 'admin' && role !== 'superadmin') {
      return { success: false, error: 'Not authorized' };
    }

    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from('org_email_templates')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[getEmailTemplates] Error:', error);
      return { success: false, error: 'Failed to fetch email templates' };
    }

    // Seed defaults for any missing types (handles new types added after initial seed)
    const existingTypes = new Set((data || []).map((r) => r.type));
    const missingTypes = ALL_EMAIL_TYPES.filter((t) => !existingTypes.has(t));
    if (missingTypes.length > 0) {
      await seedDefaultEmailTemplates(orgId);
      const { data: seeded } = await supabase
        .from('org_email_templates')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });
      return { success: true, data: (seeded || []).map(mapTemplate) };
    }

    return { success: true, data: data.map(mapTemplate) };
  } catch (error) {
    console.error('[getEmailTemplates] Error:', error);
    return { success: false, error: 'Failed to fetch email templates' };
  }
}

/**
 * Update an email template (subject, content, replyTo, isActive).
 */
export async function updateEmailTemplate(params: {
  id: string;
  subject?: string;
  content?: string;
  replyTo?: string | null;
  isActive?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Not authenticated' };

    const supabase = createSupabaseServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('org_email_templates')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    if (!existing) return { success: false, error: 'Template not found' };

    const role = await getUserRoleForOrg(userId, existing.organization_id);
    if (role !== 'admin' && role !== 'superadmin') {
      return { success: false, error: 'Not authorized' };
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (params.subject !== undefined) updateData.subject = params.subject;
    if (params.content !== undefined) updateData.content = params.content;
    if (params.replyTo !== undefined) updateData.reply_to = params.replyTo;
    if (params.isActive !== undefined) updateData.is_active = params.isActive;

    const { error } = await supabase
      .from('org_email_templates')
      .update(updateData)
      .eq('id', params.id);

    if (error) {
      console.error('[updateEmailTemplate] Error:', error);
      return { success: false, error: 'Failed to update email template' };
    }

    return { success: true };
  } catch (error) {
    console.error('[updateEmailTemplate] Error:', error);
    return { success: false, error: 'Failed to update email template' };
  }
}

/**
 * Toggle the active status of an email template.
 */
export async function toggleEmailTemplateActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  return updateEmailTemplate({ id, isActive });
}

/**
 * Seed default email templates for an organization.
 * Called on org creation or when templates are missing.
 */
export async function seedDefaultEmailTemplates(
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createSupabaseServerClient();

    const rows = ALL_EMAIL_TYPES.map((type) => {
      const defaults = EMAIL_TEMPLATE_DEFAULTS[type];
      return {
        organization_id: organizationId,
        type,
        subject: defaults.subject,
        content: defaults.content,
        is_active: type !== 'waiting_list', // waiting_list inactive until feature ships
      };
    });

    const { error } = await supabase
      .from('org_email_templates')
      .upsert(rows, { onConflict: 'organization_id,type', ignoreDuplicates: true });

    if (error) {
      console.error('[seedDefaultEmailTemplates] Error:', error);
      return { success: false, error: 'Failed to seed email templates' };
    }

    return { success: true };
  } catch (error) {
    console.error('[seedDefaultEmailTemplates] Error:', error);
    return { success: false, error: 'Failed to seed email templates' };
  }
}
