'use server';

import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getUserRoleForOrg, getUserOrganizations, type UserOrgAssignment } from '@/lib/tenant-utils';
import type { UserRole } from '@/lib/db/schema';

/**
 * Get the current user's organization assignments.
 * For use in the org switcher dropdown.
 */
export async function getCurrentUserOrganizations(): Promise<{
  success: boolean;
  data?: UserOrgAssignment[];
  error?: string;
}> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const assignments = await getUserOrganizations(userId);

    return { success: true, data: assignments };
  } catch (error) {
    console.error('[getCurrentUserOrganizations] Error:', error);
    return { success: false, error: 'Failed to fetch organizations' };
  }
}

/**
 * Get the current user's role for a specific organization.
 */
export async function getCurrentUserRoleForOrg(organizationId: string): Promise<{
  success: boolean;
  role?: UserRole | null;
  error?: string;
}> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Not authenticated' };
    }

    const role = await getUserRoleForOrg(userId, organizationId);

    return { success: true, role };
  } catch (error) {
    console.error('[getCurrentUserRoleForOrg] Error:', error);
    return { success: false, error: 'Failed to fetch role' };
  }
}

/**
 * Update a user's role in clerk_users table (their default/global role).
 * Only superadmins can change roles.
 */
export async function updateUserRole(params: {
  userId: string; // Internal clerk_users.id (UUID)
  role: UserRole;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = createSupabaseServerClient();

    // Check if current user is a superadmin
    const { data: currentUser } = await supabase
      .from('clerk_users')
      .select('role')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!currentUser || currentUser.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can update user roles' };
    }

    // Update the user's role
    const { error } = await supabase
      .from('clerk_users')
      .update({
        role: params.role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.userId);

    if (error) {
      console.error('[updateUserRole] Error:', error);
      return { success: false, error: 'Failed to update user role' };
    }

    return { success: true };
  } catch (error) {
    console.error('[updateUserRole] Error:', error);
    return { success: false, error: 'Failed to update user role' };
  }
}

/**
 * Update the current user's community profile (demographic data).
 * Users can only update their own profile.
 */
export async function updateCurrentUserProfile(params: {
  birthYear?: number | null;
  gender?: string | null;
  ethnicity?: string | null;
  workSituation?: string | null;
  housingSituation?: string | null;
  livesInCardiff?: boolean | null;
  cardiffNeighbourhood?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = createSupabaseServerClient();

    // Update the current user's profile
    const { error } = await supabase
      .from('clerk_users')
      .update({
        birth_year: params.birthYear,
        gender: params.gender,
        ethnicity: params.ethnicity,
        work_situation: params.workSituation,
        housing_situation: params.housingSituation,
        lives_in_cardiff: params.livesInCardiff,
        cardiff_neighbourhood: params.cardiffNeighbourhood,
        updated_at: new Date().toISOString(),
      })
      .eq('clerk_user_id', clerkUserId);

    if (error) {
      console.error('[updateCurrentUserProfile] Error:', error);
      return { success: false, error: 'Failed to update profile' };
    }

    return { success: true };
  } catch (error) {
    console.error('[updateCurrentUserProfile] Error:', error);
    return { success: false, error: 'Failed to update profile' };
  }
}

/**
 * Create a new organization.
 * Only superadmins can create organizations.
 */
/**
 * Check if the current user's community profile is complete.
 * Returns true if lives_in_cardiff is NOT NULL (i.e., they've answered the question).
 */
export async function isProfileComplete(): Promise<{
  success: boolean;
  isComplete?: boolean;
  error?: string;
}> {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = createSupabaseServerClient();

    const { data: user, error } = await supabase
      .from('clerk_users')
      .select('lives_in_cardiff')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (error) {
      console.error('[isProfileComplete] Error:', error);
      return { success: false, error: 'Failed to check profile' };
    }

    // Profile is complete if lives_in_cardiff is not null
    return { success: true, isComplete: user.lives_in_cardiff !== null };
  } catch (error) {
    console.error('[isProfileComplete] Error:', error);
    return { success: false, error: 'Failed to check profile' };
  }
}

/**
 * Create a new organization.
 * Only superadmins can create organizations.
 */
export async function createOrganization(params: {
  name: string;
  slug: string;
  description?: string;
}): Promise<{ success: boolean; organizationId?: string; error?: string }> {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = createSupabaseServerClient();

    // Check if current user is a superadmin
    const { data: currentUser } = await supabase
      .from('clerk_users')
      .select('role')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!currentUser || currentUser.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can create organizations' };
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
    if (!slugRegex.test(params.slug)) {
      return { success: false, error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens (3-50 chars)' };
    }

    // Check if slug is already taken
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', params.slug)
      .single();

    if (existingOrg) {
      return { success: false, error: 'An organization with this slug already exists' };
    }

    // Create the organization
    const { data: newOrg, error } = await supabase
      .from('organizations')
      .insert({
        name: params.name,
        slug: params.slug,
        description: params.description || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[createOrganization] Error:', error);
      return { success: false, error: 'Failed to create organization' };
    }

    return { success: true, organizationId: newOrg.id };
  } catch (error) {
    console.error('[createOrganization] Error:', error);
    return { success: false, error: 'Failed to create organization' };
  }
}
