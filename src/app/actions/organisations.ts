'use server';

import { auth } from '@clerk/nextjs/server';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { createSupabaseServerClient } from '@/lib/supabase';

async function requireSuperAdmin() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { error: 'Not authenticated' as const };

  const supabase = createSupabaseServerClient();
  const { data: caller } = await supabase
    .from('clerk_users')
    .select('role, organization_id')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (!caller || caller.role !== 'superadmin') {
    return { error: 'Forbidden: superadmin access required' as const };
  }

  return { clerkUserId, supabase };
}

export interface OrgRow {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  faviconUrl: string | null;
  logoUrl: string | null;
  userCount: number;
  stripeConnected: boolean;
  createdAt: string;
}

export async function listOrganisations(): Promise<{ success: boolean; data?: OrgRow[]; error?: string }> {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select(`
      id, name, short_name, slug, favicon_url, logo_url, created_at,
      clerk_users(count),
      stripe_connect_accounts(charges_enabled)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[listOrganisations] Error:', error);
    return { success: false, error: 'Failed to fetch organisations' };
  }

  const rows: OrgRow[] = (orgs ?? []).map((org: any) => ({
    id: org.id,
    name: org.name,
    shortName: org.short_name ?? null,
    slug: org.slug,
    faviconUrl: org.favicon_url,
    logoUrl: org.logo_url,
    userCount: org.clerk_users?.[0]?.count ?? 0,
    stripeConnected: org.stripe_connect_accounts?.[0]?.charges_enabled === true,
    createdAt: org.created_at,
  }));

  return { success: true, data: rows };
}

export async function updateOrganisation(params: {
  id: string;
  name: string;
  shortName?: string | null;
  slug: string;
}): Promise<{ success: boolean; error?: string }> {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
  if (!slugRegex.test(params.slug)) {
    return { success: false, error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens (3-50 chars).' };
  }

  // Check slug uniqueness (exclude this org)
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', params.slug)
    .neq('id', params.id)
    .single();

  if (existing) {
    return { success: false, error: 'This slug is already taken.' };
  }

  const updateData: Record<string, any> = { name: params.name, slug: params.slug, updated_at: new Date().toISOString() };
  if (params.shortName !== undefined) updateData.short_name = params.shortName;

  const { error } = await supabase
    .from('organizations')
    .update(updateData)
    .eq('id', params.id);

  if (error) {
    console.error('[updateOrganisation] Error:', error);
    return { success: false, error: 'Failed to update organisation' };
  }

  return { success: true };
}

export async function deleteOrganisation(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return { success: false, error: ctx.error };
  const { supabase } = ctx;

  // 1. Fetch all non-superadmin users in this org so we can delete them from Clerk
  const { data: orgUsers } = await supabase
    .from('clerk_users')
    .select('clerk_user_id, role')
    .eq('organization_id', id)
    .neq('role', 'superadmin');

  // 2. Delete each user from Clerk (best-effort, don't abort on failure)
  for (const u of orgUsers ?? []) {
    if (u.clerk_user_id && !u.clerk_user_id.startsWith('pending_')) {
      try {
        await clerkClient.users.deleteUser(u.clerk_user_id);
      } catch (e) {
        console.warn('[deleteOrganisation] Failed to delete Clerk user:', u.clerk_user_id, e);
      }
    }
  }

  // 3. Delete clerk_users rows for this org
  await supabase.from('clerk_users').delete().eq('organization_id', id);

  // 4. Get template IDs to cascade session data
  const { data: templates } = await supabase
    .from('session_templates')
    .select('id')
    .eq('organization_id', id);

  const templateIds = (templates ?? []).map((t: any) => t.id);

  if (templateIds.length > 0) {
    // Get instance IDs
    const { data: instances } = await supabase
      .from('session_instances')
      .select('id')
      .in('schedule_id',
        (await supabase.from('session_schedules').select('id').in('template_id', templateIds)).data?.map((s: any) => s.id) ?? []
      );

    const instanceIds = (instances ?? []).map((i: any) => i.id);

    if (instanceIds.length > 0) {
      await supabase.from('bookings').delete().in('session_instance_id', instanceIds);
      await supabase.from('waiting_list_entries').delete().in('session_instance_id', instanceIds);
      await supabase.from('instance_price_options').delete().in('instance_id', instanceIds);
      await supabase.from('instance_membership_overrides').delete().in('instance_id', instanceIds);
      await supabase.from('session_instances').delete().in('id', instanceIds);
    }

    await supabase.from('session_schedules').delete().in('template_id', templateIds);
    await supabase.from('session_one_off_dates').delete().in('template_id', templateIds);
    await supabase.from('session_price_options').delete().in('template_id', templateIds);
    await supabase.from('session_membership_prices').delete().in('template_id', templateIds);
    await supabase.from('session_templates').delete().in('id', templateIds);
  }

  // 5. Delete remaining org-level data
  await supabase.from('price_options').delete().eq('organization_id', id);
  await supabase.from('user_memberships').delete().eq('organization_id', id);
  await supabase.from('memberships').delete().eq('organization_id', id);
  await supabase.from('org_email_templates').delete().eq('organization_id', id);
  await supabase.from('waivers').delete().eq('organization_id', id);
  await supabase.from('stripe_connect_accounts').delete().eq('organization_id', id);

  // 6. Delete the org itself
  const { error } = await supabase.from('organizations').delete().eq('id', id);

  if (error) {
    console.error('[deleteOrganisation] Error:', error);
    return { success: false, error: 'Failed to delete organisation' };
  }

  return { success: true };
}
