import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Headers for tenant context
const TENANT_ID_HEADER = 'x-organization-id';
const TENANT_SLUG_HEADER = 'x-organization-slug';

// Routes that should bypass slug detection
const BYPASS_PATHS = [
  '/_next',
  '/api',
  '/sign-in',
  '/sign-up',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
];

// Static file extensions to bypass
const STATIC_EXTENSIONS = [
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.css', '.js', '.map', '.woff', '.woff2', '.ttf', '.eot',
];

// Cache for organization lookups (edge runtime compatible)
const orgCache = new Map<string, { data: { id: string; slug: string } | null; expiry: number }>();
const userOrgCache = new Map<string, { slug: string | null; isSuperAdmin: boolean; expiry: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Fetch organization by slug from Supabase.
 * Uses direct fetch for edge runtime compatibility.
 */
async function getOrganizationBySlug(slug: string): Promise<{ id: string; slug: string } | null> {
  // Check cache first
  const cached = orgCache.get(slug);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Missing Supabase environment variables');
    return null;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}&select=id,slug`,
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[Middleware] Supabase query failed:', response.status);
      return null;
    }

    const data = await response.json();
    const org = data?.[0] || null;

    // Cache the result
    orgCache.set(slug, { data: org, expiry: Date.now() + CACHE_TTL });

    return org;
  } catch (error) {
    console.error('[Middleware] Error fetching organization:', error);
    return null;
  }
}

/**
 * Fetch user data (org slug and admin status) by their Clerk user ID.
 * Looks up the clerk_users table to find their organization and admin status.
 */
async function getUserData(clerkUserId: string): Promise<{ slug: string | null; isSuperAdmin: boolean }> {
  // Check cache first
  const cached = userOrgCache.get(clerkUserId);
  if (cached && cached.expiry > Date.now()) {
    return { slug: cached.slug, isSuperAdmin: cached.isSuperAdmin };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Middleware] Missing Supabase environment variables');
    return { slug: null, isSuperAdmin: false };
  }

  try {
    // Get the user's organization_id and is_super_admin from clerk_users
    const userResponse = await fetch(
      `${supabaseUrl}/rest/v1/clerk_users?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=organization_id,is_super_admin`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!userResponse.ok) {
      console.error('[Middleware] Failed to fetch user:', userResponse.status);
      return { slug: null, isSuperAdmin: false };
    }

    const userData = await userResponse.json();
    const organizationId = userData?.[0]?.organization_id;
    const isSuperAdmin = userData?.[0]?.is_super_admin || false;

    if (!organizationId) {
      console.log('[Middleware] User has no organization:', clerkUserId);
      userOrgCache.set(clerkUserId, { slug: null, isSuperAdmin, expiry: Date.now() + CACHE_TTL });
      return { slug: null, isSuperAdmin };
    }

    // Now get the organization's slug
    const orgResponse = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}&select=slug`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!orgResponse.ok) {
      console.error('[Middleware] Failed to fetch organization:', orgResponse.status);
      return { slug: null, isSuperAdmin };
    }

    const orgData = await orgResponse.json();
    const slug = orgData?.[0]?.slug || null;

    // Cache the result
    userOrgCache.set(clerkUserId, { slug, isSuperAdmin, expiry: Date.now() + CACHE_TTL });

    return { slug, isSuperAdmin };
  } catch (error) {
    console.error('[Middleware] Error fetching user data:', error);
    return { slug: null, isSuperAdmin: false };
  }
}

/**
 * Check if a path should bypass slug detection.
 */
function shouldBypassSlugDetection(pathname: string): boolean {
  // Check bypass paths
  if (BYPASS_PATHS.some(path => pathname.startsWith(path))) {
    return true;
  }

  // Check static file extensions
  if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
    return true;
  }

  // Root path is special - we'll redirect to sign-in or default org
  if (pathname === '/') {
    return true;
  }

  return false;
}

/**
 * Extract the slug from the first path segment.
 */
function extractSlugFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  return segments[0];
}

// Define public routes that don't require authentication
// Note: /{slug} booking routes are public but admin routes require auth (handled in middleware)
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
  '/api/webhooks(.*)',
]);

// Check if it's an admin route within the slug structure
function isAdminRoute(pathname: string): boolean {
  // Pattern: /{slug}/admin or /{slug}/admin/...
  const segments = pathname.split('/').filter(Boolean);
  return segments.length >= 2 && segments[1] === 'admin';
}

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const pathname = req.nextUrl.pathname;

  // Bypass slug detection for special paths
  if (shouldBypassSlugDetection(pathname)) {
    // Handle root page redirect for authenticated users
    if (pathname === '/') {
      if (userId) {
        // Look up user's org slug and redirect there
        const userData = await getUserData(userId);
        if (userData.slug) {
          return NextResponse.redirect(new URL(`/${userData.slug}`, req.url));
        }
        // User has no org - send to sign-in (they may need to be invited to an org)
        return NextResponse.redirect(new URL('/sign-in', req.url));
      }
      // Unauthenticated users go to sign-in
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    // Handle sign-in/sign-up for authenticated users - redirect to their org
    if (userId && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
      const userData = await getUserData(userId);
      if (userData.slug) {
        return NextResponse.redirect(new URL(`/${userData.slug}`, req.url));
      }
    }

    return NextResponse.next();
  }

  // Extract slug from path
  const slug = extractSlugFromPath(pathname);

  if (!slug) {
    // No slug found - this shouldn't happen after bypass check, but handle gracefully
    return NextResponse.next();
  }

  // Look up organization by slug
  const org = await getOrganizationBySlug(slug);

  if (!org) {
    // Invalid slug - return 404
    // Rewrite to a 404 page (you may need to create /app/not-found.tsx)
    return NextResponse.rewrite(new URL('/not-found', req.url));
  }

  // Create response with tenant headers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(TENANT_ID_HEADER, org.id);
  requestHeaders.set(TENANT_SLUG_HEADER, org.slug);

  // Check if this is an admin route
  if (isAdminRoute(pathname)) {
    // Admin routes require authentication
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }

    // Check if user has admin access from Supabase clerk_users table
    const userData = await getUserData(userId);

    if (!userData.isSuperAdmin) {
      // Regular users can't access admin - redirect to booking page for this org
      return NextResponse.redirect(new URL(`/${org.slug}`, req.url));
    }

    // Super admins can access any org's admin
  }

  // For public booking pages (/{slug}, /{slug}/checkout, etc.), allow access
  // The headers will be passed to server components for context

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
