import { headers } from 'next/headers';
import { cache } from 'react';
import { createSupabaseServerClient } from './supabase';

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
    .select('is_super_admin')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.is_super_admin || false;
});
