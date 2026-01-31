import { headers } from 'next/headers';
import { cache } from 'react';
import { createSupabaseServerClient } from './supabase';
import type { UserRole } from './db/schema';

/**
 * Organization data returned from tenant utilities.
 */
export interface TenantOrganization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

/**
 * User's organization assignment with role info.
 */
export interface UserOrgAssignment {
  organizationId: string;
  role: UserRole;
  isPrimary: boolean;
  organization: TenantOrganization;
}

/**
 * Tenant context extracted from request headers.
 * Set by middleware after validating the slug.
 */
export interface TenantContext {
  organizationId: string;
  organizationSlug: string;
}

// Header names for tenant context
export const TENANT_ID_HEADER = 'x-organization-id';
export const TENANT_SLUG_HEADER = 'x-organization-slug';

/**
 * Get organization by slug from the database.
 * Uses React cache() for request-level deduplication.
 */
export const getOrganizationBySlug = cache(async (slug: string): Promise<TenantOrganization | null> => {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, description, logo_url')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    logoUrl: data.logo_url,
  };
});

/**
 * Get organization by ID from the database.
 * Uses React cache() for request-level deduplication.
 */
export const getOrganizationById = cache(async (id: string): Promise<TenantOrganization | null> => {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, description, logo_url')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    logoUrl: data.logo_url,
  };
});

/**
 * Get tenant context from request headers in a Server Component.
 * Returns null if headers are not set (middleware didn't validate).
 */
export async function getTenantFromHeaders(): Promise<TenantContext | null> {
  const headersList = await headers();
  const organizationId = headersList.get(TENANT_ID_HEADER);
  const organizationSlug = headersList.get(TENANT_SLUG_HEADER);

  if (!organizationId || !organizationSlug) {
    return null;
  }

  return {
    organizationId,
    organizationSlug,
  };
}

/**
 * Get tenant context from headers, throwing if not available.
 * Use in pages/components that require tenant context.
 */
export async function requireTenantFromHeaders(): Promise<TenantContext> {
  const tenant = await getTenantFromHeaders();

  if (!tenant) {
    throw new Error('Tenant context not found. Ensure middleware is configured correctly.');
  }

  return tenant;
}

/**
 * Get full organization data for the current tenant from headers.
 * Combines header lookup with database fetch.
 */
export async function getTenantOrganization(): Promise<TenantOrganization | null> {
  const tenant = await getTenantFromHeaders();

  if (!tenant) {
    return null;
  }

  return getOrganizationById(tenant.organizationId);
}

/**
 * Validate that a slug is well-formed (for client-side validation).
 * Slugs must be lowercase alphanumeric with hyphens, 3-50 chars.
 */
export function isValidSlug(slug: string): boolean {
  const slugRegex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
  return slugRegex.test(slug);
}

/**
 * Generate a slug from a name.
 * Converts to lowercase, replaces spaces/special chars with hyphens.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Check if a user is a super admin by their Clerk user ID.
 * Uses React cache() for request-level deduplication.
 */
export const isUserSuperAdmin = cache(async (clerkUserId: string): Promise<boolean> => {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('clerk_users')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.role === 'superadmin';
});

/**
 * Get the user's role for a specific organization.
 * Simplified logic:
 * - Superadmins can access ANY org (return 'superadmin')
 * - Admins can only access their own org (check organization_id match)
 * - Regular users cannot access admin routes
 */
export const getUserRoleForOrg = cache(async (
  clerkUserId: string,
  organizationId: string
): Promise<UserRole | null> => {
  const supabase = createSupabaseServerClient();

  // Get user's role and organization_id from clerk_users
  const { data: userData, error: userError } = await supabase
    .from('clerk_users')
    .select('role, organization_id')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (userError || !userData) {
    return null;
  }

  const role = userData.role as UserRole;

  // Superadmins can access any organization
  if (role === 'superadmin') {
    return 'superadmin';
  }

  // Admins can only access their own organization
  if (role === 'admin' && userData.organization_id === organizationId) {
    return 'admin';
  }

  // Regular users or admins trying to access a different org
  return null;
});

/**
 * Get all organizations a user has access to.
 * For the org switcher dropdown.
 * - Superadmins: return ALL organizations
 * - Others: return just their single organization
 */
export const getUserOrganizations = cache(async (
  clerkUserId: string
): Promise<UserOrgAssignment[]> => {
  const supabase = createSupabaseServerClient();

  // Get user's role and organization_id
  const { data: userData, error: userError } = await supabase
    .from('clerk_users')
    .select('role, organization_id')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (userError || !userData) {
    return [];
  }

  const role = userData.role as UserRole;

  // Superadmins get access to ALL organizations
  if (role === 'superadmin') {
    const { data: allOrgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, slug, description, logo_url')
      .order('name');

    if (orgsError || !allOrgs) {
      return [];
    }

    return allOrgs.map((org: any) => ({
      organizationId: org.id,
      role: 'superadmin' as UserRole,
      isPrimary: org.id === userData.organization_id,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        logoUrl: org.logo_url,
      },
    }));
  }

  // Regular users/admins get their single org
  if (!userData.organization_id) {
    return [];
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, description, logo_url')
    .eq('id', userData.organization_id)
    .single();

  if (orgError || !org) {
    return [];
  }

  return [{
    organizationId: org.id,
    role: role,
    isPrimary: true,
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      logoUrl: org.logo_url,
    },
  }];
});

/**
 * Check if a user can access the admin panel for an organization.
 * Returns true if user has 'admin' or 'superadmin' role for the org.
 */
export const canAccessAdminForOrg = cache(async (
  clerkUserId: string,
  organizationId: string
): Promise<boolean> => {
  const role = await getUserRoleForOrg(clerkUserId, organizationId);
  return role === 'admin' || role === 'superadmin';
});

/**
 * Get the user's default/global role from clerk_users table.
 */
export const getUserRole = cache(async (clerkUserId: string): Promise<UserRole | null> => {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('clerk_users')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as UserRole;
});
