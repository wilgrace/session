/**
 * Environment-aware URL configuration for the application.
 * Handles localhost, Vercel preview, and production environments.
 */

/**
 * Get the base URL for the application based on the current environment.
 * Used for Clerk redirects, Stripe callbacks, and other absolute URL needs.
 */
export function getBaseUrl(): string {
  // Server-side: use environment variables
  if (typeof window === 'undefined') {
    // Development
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000';
    }

    // Vercel preview deployments
    if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }

    // Production or explicit app URL
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return process.env.NEXT_PUBLIC_APP_URL;
    }

    // Fallback for Vercel production
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }

    return 'http://localhost:3000';
  }

  // Client-side: use window.location.origin
  return window.location.origin;
}

/**
 * Build a full URL path with the base URL.
 */
export function getFullUrl(path: string): string {
  const base = getBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Get the URL for a specific organization's page.
 */
export function getOrgUrl(slug: string, path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : path ? `/${path}` : '';
  return getFullUrl(`/${slug}${normalizedPath}`);
}

/**
 * Get the admin URL for a specific organization.
 */
export function getAdminUrl(slug: string, path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : path ? `/${path}` : '';
  return getFullUrl(`/${slug}/admin${normalizedPath}`);
}
