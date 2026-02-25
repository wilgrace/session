'use server';

import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getUserRoleForOrg, getTenantFromHeaders } from '@/lib/tenant-utils';

/**
 * Organization settings returned from getOrganizationSettings
 */
export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  headerImageUrl: string | null;
  defaultSessionImageUrl: string | null;
  brandColor: string | null;
  brandTextColor: string | null;
  // External links
  homepageUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  // Member pricing fields
  memberPriceType: string | null;
  memberDiscountPercent: number | null;
  memberFixedPrice: number | null;
  communitySurveyEnabled: boolean;
}

/**
 * Get full organization settings for the admin settings page.
 * If organizationId is not provided, it will be retrieved from request headers.
 */
export async function getOrganizationSettings(organizationId?: string): Promise<{
  success: boolean;
  data?: OrganizationSettings;
  error?: string;
}> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get organization ID from headers if not provided
    let orgId = organizationId;
    if (!orgId) {
      const tenant = await getTenantFromHeaders();
      if (!tenant) {
        return { success: false, error: 'Organization context not found' };
      }
      orgId = tenant.organizationId;
    }

    // Check if user has admin access
    const role = await getUserRoleForOrg(userId, orgId);
    if (role !== 'admin' && role !== 'superadmin') {
      return { success: false, error: 'Not authorized to access organization settings' };
    }

    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        slug,
        description,
        logo_url,
        favicon_url,
        header_image_url,
        default_session_image_url,
        button_color,
        button_text_color,
        homepage_url,
        instagram_url,
        facebook_url,
        member_price_type,
        member_discount_percent,
        member_fixed_price,
        community_survey_enabled
      `)
      .eq('id', orgId)
      .single();

    if (error || !data) {
      console.error('[getOrganizationSettings] Error:', error);
      return { success: false, error: 'Failed to fetch organization settings' };
    }

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        logoUrl: data.logo_url,
        faviconUrl: data.favicon_url,
        headerImageUrl: data.header_image_url,
        defaultSessionImageUrl: data.default_session_image_url,
        brandColor: data.button_color,
        brandTextColor: data.button_text_color,
        homepageUrl: data.homepage_url,
        instagramUrl: data.instagram_url,
        facebookUrl: data.facebook_url,
        memberPriceType: data.member_price_type,
        memberDiscountPercent: data.member_discount_percent,
        memberFixedPrice: data.member_fixed_price,
        communitySurveyEnabled: data.community_survey_enabled ?? true,
      },
    };
  } catch (error) {
    console.error('[getOrganizationSettings] Error:', error);
    return { success: false, error: 'Failed to fetch organization settings' };
  }
}

/**
 * Update organization branding and basic settings.
 * Admins can update their own organization settings.
 */
export async function updateOrganizationSettings(params: {
  organizationId: string;
  name?: string;
  description?: string | null;
  slug?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  headerImageUrl?: string | null;
  defaultSessionImageUrl?: string | null;
  brandColor?: string | null;
  brandTextColor?: string | null;
  homepageUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user has admin access
    const role = await getUserRoleForOrg(userId, params.organizationId);
    if (role !== 'admin' && role !== 'superadmin') {
      return { success: false, error: 'Not authorized to update organization settings' };
    }

    const supabase = createSupabaseServerClient();

    // If slug is being changed, validate and check uniqueness
    if (params.slug !== undefined) {
      const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
      if (!slugRegex.test(params.slug)) {
        return {
          success: false,
          error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens (3-50 chars)',
        };
      }

      // Check if slug is already taken by another organization
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', params.slug)
        .neq('id', params.organizationId)
        .single();

      if (existingOrg) {
        return { success: false, error: 'This URL path is already in use by another organization' };
      }
    }

    // Validate brand colors if provided
    if (params.brandColor !== undefined && params.brandColor !== null) {
      if (!isValidHexColor(params.brandColor)) {
        return { success: false, error: 'Invalid brand color format. Use hex format (e.g., #6c47ff)' };
      }
    }

    if (params.brandTextColor !== undefined && params.brandTextColor !== null) {
      if (!isValidHexColor(params.brandTextColor)) {
        return { success: false, error: 'Invalid brand text color format. Use hex format (e.g., #ffffff)' };
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.slug !== undefined) updateData.slug = params.slug;
    if (params.logoUrl !== undefined) updateData.logo_url = params.logoUrl;
    if (params.faviconUrl !== undefined) updateData.favicon_url = params.faviconUrl;
    if (params.headerImageUrl !== undefined) updateData.header_image_url = params.headerImageUrl;
    if (params.defaultSessionImageUrl !== undefined) updateData.default_session_image_url = params.defaultSessionImageUrl;
    if (params.brandColor !== undefined) updateData.button_color = params.brandColor;
    if (params.brandTextColor !== undefined) updateData.button_text_color = params.brandTextColor;
    if (params.homepageUrl !== undefined) updateData.homepage_url = params.homepageUrl;
    if (params.instagramUrl !== undefined) updateData.instagram_url = params.instagramUrl;
    if (params.facebookUrl !== undefined) updateData.facebook_url = params.facebookUrl;

    const { error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', params.organizationId);

    if (error) {
      console.error('[updateOrganizationSettings] Error:', error);
      return { success: false, error: 'Failed to update organization settings' };
    }

    return { success: true };
  } catch (error) {
    console.error('[updateOrganizationSettings] Error:', error);
    return { success: false, error: 'Failed to update organization settings' };
  }
}

/**
 * Apply the org's default session image to all session templates that have no image set.
 * Called after saving org settings with a default session image.
 */
export async function applyDefaultImageToSessions(organizationId: string): Promise<{
  success: boolean;
  updated?: number;
  error?: string;
}> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Not authenticated' };

    const role = await getUserRoleForOrg(userId, organizationId);
    if (role !== 'admin' && role !== 'superadmin') {
      return { success: false, error: 'Not authorized' };
    }

    const supabase = createSupabaseServerClient();

    // Get the org's default session image
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('default_session_image_url')
      .eq('id', organizationId)
      .single();

    if (orgError || !org?.default_session_image_url) {
      return { success: true, updated: 0 };
    }

    // Update all session templates with no image
    const { data, error } = await supabase
      .from('session_templates')
      .update({ image_url: org.default_session_image_url })
      .eq('organization_id', organizationId)
      .is('image_url', null)
      .select('id');

    if (error) {
      console.error('[applyDefaultImageToSessions] Error:', error);
      return { success: false, error: 'Failed to update sessions' };
    }

    return { success: true, updated: data?.length ?? 0 };
  } catch (error) {
    console.error('[applyDefaultImageToSessions] Error:', error);
    return { success: false, error: 'Failed to update sessions' };
  }
}

/**
 * Check if a slug is available (not already in use).
 * Optionally exclude a specific organization ID (for editing).
 */
export async function checkSlugAvailability(
  slug: string,
  excludeOrgId?: string
): Promise<{ success: boolean; available?: boolean; error?: string }> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
    if (!slugRegex.test(slug)) {
      return { success: true, available: false };
    }

    const supabase = createSupabaseServerClient();

    let query = supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug);

    if (excludeOrgId) {
      query = query.neq('id', excludeOrgId);
    }

    const { data } = await query.single();

    return { success: true, available: !data };
  } catch (error) {
    console.error('[checkSlugAvailability] Error:', error);
    return { success: false, error: 'Failed to check slug availability' };
  }
}

/**
 * Toggle community survey enabled for an organization.
 * Admins can enable or disable the community survey for their org.
 */
export async function toggleCommunitySurvey(
  organizationId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const role = await getUserRoleForOrg(userId, organizationId);
    if (role !== 'admin' && role !== 'superadmin') {
      return { success: false, error: 'Not authorized' };
    }

    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from('organizations')
      .update({ community_survey_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', organizationId);

    if (error) {
      console.error('[toggleCommunitySurvey] Error:', error);
      return { success: false, error: 'Failed to update community survey setting' };
    }

    return { success: true };
  } catch (error) {
    console.error('[toggleCommunitySurvey] Error:', error);
    return { success: false, error: 'Failed to update community survey setting' };
  }
}

/**
 * Get whether the community survey is enabled for an organization.
 * No admin check — used by public-facing components.
 * Falls back to true (enabled) if org not found.
 */
export async function getCommunitySurveyEnabled(organizationId?: string): Promise<{
  success: boolean;
  enabled?: boolean;
  error?: string;
}> {
  try {
    let orgId = organizationId;
    if (!orgId) {
      const tenant = await getTenantFromHeaders();
      if (!tenant) {
        return { success: true, enabled: true };
      }
      orgId = tenant.organizationId;
    }

    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from('organizations')
      .select('community_survey_enabled')
      .eq('id', orgId)
      .single();

    if (error || !data) {
      return { success: true, enabled: true };
    }

    return { success: true, enabled: data.community_survey_enabled ?? true };
  } catch (error) {
    console.error('[getCommunitySurveyEnabled] Error:', error);
    return { success: true, enabled: true };
  }
}

/**
 * Validate hex color format.
 */
function isValidHexColor(color: string): boolean {
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexRegex.test(color);
}
