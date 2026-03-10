'use server';

import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { seedDefaultEmailTemplates } from '@/app/actions/email-templates';
import { sendAdminWelcomeEmail } from '@/lib/email';
import { randomUUID } from 'crypto';

// Slug validation regex — matches the same rule used in organization.ts
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

const DEFAULT_WAIVER_CONTENT = `By booking a session, I confirm that:

- I am in good health and have no medical conditions that would prevent me from safely participating in this session.
- I understand and accept the health and safety guidelines of this facility.
- I accept responsibility for my own health and wellbeing during my session.
- I will inform a member of staff of any concerns before my session begins.

I understand that this organisation reserves the right to refuse entry if they have reasonable concern about my health or safety.

---

This is a default waiver. Please review and update this text to reflect your facility's specific rules and any legal requirements applicable to your business.`;

export type OnboardingStatus = 'complete' | 'incomplete' | 'unauthenticated' | 'customer';

/**
 * Check whether the currently authenticated user has completed onboarding.
 *
 * Returns:
 *  - { status: 'complete', slug }     — admin of their own org → redirect to admin
 *  - { status: 'customer', slug }     — user of a non-default org → redirect to booking page
 *  - { status: 'incomplete' }         — new user awaiting org creation
 *  - { status: 'unauthenticated' }    — not signed in
 */
export async function checkOnboardingStatus(): Promise<{
  status: OnboardingStatus;
  slug?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) return { status: 'unauthenticated' };

    const supabase = createSupabaseServerClient();

    const { data: user } = await supabase
      .from('clerk_users')
      .select('organization_id, role')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    if (!user) return { status: 'incomplete' };

    // Superadmins skip onboarding entirely
    if (user.role === 'superadmin') {
      const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', user.organization_id)
        .single();
      return { status: 'complete', slug: org?.slug ?? undefined };
    }

    const defaultOrgId = process.env.DEFAULT_ORGANIZATION_ID;

    // Admin of their own org → onboarding complete
    if (user.role === 'admin' && user.organization_id !== defaultOrgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', user.organization_id)
        .single();
      if (org?.slug) return { status: 'complete', slug: org.slug };
    }

    // Regular user in a non-default org → booking customer, not a tenant admin
    if (user.role === 'user' && user.organization_id !== defaultOrgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', user.organization_id)
        .single();
      if (org?.slug) return { status: 'customer', slug: org.slug };
    }

    return { status: 'incomplete' };
  } catch {
    return { status: 'incomplete' };
  }
}

/**
 * Create a new organization for the currently authenticated user.
 * Callable by any authenticated user — does NOT require superadmin.
 *
 * On success:
 * - Creates the organization row
 * - Updates clerk_users: sets organization_id + role = 'admin'
 * - Seeds all 6 email templates
 * - Seeds a default waiver (active by default — admin can edit from Settings > Waivers)
 */
export async function createOrganizationForUser(params: {
  // Step 1 (required)
  name: string;
  slug: string;
  description?: string;
  homepageUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  // Step 2 (optional)
  logoUrl?: string;
  faviconUrl?: string;
  headerImageUrl?: string;
  defaultSessionImageUrl?: string;
  brandColor?: string;
  brandTextColor?: string;
}): Promise<{ success: boolean; slug?: string; organizationId?: string; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Not authenticated' };

    const supabase = createSupabaseServerClient();

    // Verify the user record exists (webhook may still be syncing)
    const { data: currentUser } = await supabase
      .from('clerk_users')
      .select('id, organization_id, role')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    if (!currentUser) {
      return {
        success: false,
        error: 'Your account is still being set up. Please wait a moment and try again.',
      };
    }

    // Validate slug format
    if (!SLUG_REGEX.test(params.slug)) {
      return {
        success: false,
        error: 'Invalid booking URL. Use 3–50 lowercase letters, numbers, and hyphens (e.g. my-sauna).',
      };
    }

    // Check slug uniqueness
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', params.slug)
      .maybeSingle();

    if (existingOrg) {
      return { success: false, error: 'This booking URL is already taken. Please choose another.' };
    }

    // Validate optional hex colours
    if (params.brandColor && !isValidHexColor(params.brandColor)) {
      return { success: false, error: 'Invalid brand colour format. Use hex (e.g. #6c47ff).' };
    }
    if (params.brandTextColor && !isValidHexColor(params.brandTextColor)) {
      return { success: false, error: 'Invalid button text colour format. Use hex (e.g. #ffffff).' };
    }

    // Create the organisation (id must be supplied — no DB-level default)
    const { data: newOrg, error: createOrgError } = await supabase
      .from('organizations')
      .insert({
        id: randomUUID(),
        name: params.name.trim(),
        slug: params.slug.trim(),
        description: params.description?.trim() || null,
        homepage_url: params.homepageUrl?.trim() || null,
        instagram_url: params.instagramUrl?.trim() || null,
        facebook_url: params.facebookUrl?.trim() || null,
        logo_url: params.logoUrl || null,
        favicon_url: params.faviconUrl || null,
        header_image_url: params.headerImageUrl || null,
        default_session_image_url: params.defaultSessionImageUrl || null,
        button_color: params.brandColor || '#6c47ff',
        button_text_color: params.brandTextColor || '#ffffff',
      })
      .select('id, slug')
      .single();

    if (createOrgError || !newOrg) {
      console.error('[createOrganizationForUser] Error creating org:', createOrgError);
      return { success: false, error: 'Failed to create organisation. Please try again.' };
    }

    // Assign the user as admin of the new org
    const { error: updateUserError } = await supabase
      .from('clerk_users')
      .update({
        organization_id: newOrg.id,
        role: 'admin',
        updated_at: new Date().toISOString(),
      })
      .eq('clerk_user_id', userId);

    if (updateUserError) {
      // Attempt rollback before returning error
      await supabase.from('organizations').delete().eq('id', newOrg.id);
      console.error('[createOrganizationForUser] Error updating user:', updateUserError);
      return { success: false, error: 'Failed to configure your account. Please try again.' };
    }

    // Seed email templates (non-fatal)
    const emailResult = await seedDefaultEmailTemplates(newOrg.id);
    if (!emailResult.success) {
      console.error('[createOrganizationForUser] Failed to seed email templates:', emailResult.error);
    }

    // Seed default waiver via direct insert (non-fatal).
    // We bypass createWaiver() because it uses requireTenantFromHeaders() which
    // is not available in this context.
    const { error: waiverError } = await supabase.from('waivers').insert({
      organization_id: newOrg.id,
      title: 'Health & Safety Waiver',
      content: DEFAULT_WAIVER_CONTENT,
      agreement_type: 'checkbox',
      is_active: true,
      version: 1,
    });

    if (waiverError) {
      console.error('[createOrganizationForUser] Failed to seed waiver:', waiverError);
    }

    // Send platform welcome email (non-fatal)
    sendAdminWelcomeEmail(userId, newOrg.id, newOrg.slug, params.name.trim()).catch((err) => {
      console.error('[createOrganizationForUser] Failed to send welcome email:', err);
    });

    return { success: true, slug: newOrg.slug, organizationId: newOrg.id };
  } catch (error) {
    console.error('[createOrganizationForUser] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}
