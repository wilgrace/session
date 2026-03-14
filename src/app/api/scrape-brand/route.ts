import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

interface BrandData {
  description?: string;
  logoUrl?: string;
  faviconUrl?: string;
  headerImageUrl?: string;
  defaultSessionImageUrl?: string;
  brandColor?: string;
}

function extractMetaContent(html: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ success: false, error: 'Missing url param' }, { status: 400 });
  }

  let pageUrl: string;
  try {
    pageUrl = new URL(url).href;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let html: string;
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookASession/1.0)' },
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `HTTP ${res.status}` });
    }
    html = await res.text();
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch URL' });
  } finally {
    clearTimeout(timeout);
  }

  const origin = new URL(pageUrl).origin;
  const data: BrandData = {};

  // Description: og:description first, then meta description
  data.description = extractMetaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  ]);

  // og:image → header + session image
  const ogImage = extractMetaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]);
  if (ogImage) {
    const resolved = resolveUrl(ogImage, pageUrl);
    data.headerImageUrl = resolved;
    data.defaultSessionImageUrl = resolved;
  }

  // Favicon: prefer non-.ico, fall back to /favicon.ico
  const faviconHref = extractMetaContent(html, [
    // SVG or PNG icons first
    /<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+\.(?:svg|png|webp))["']/i,
    /<link[^>]+href=["']([^"']+\.(?:svg|png|webp))["'][^>]+rel=["']icon["']/i,
    // Apple touch icon
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
    // Any icon
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  ]);
  data.faviconUrl = faviconHref ? resolveUrl(faviconHref, pageUrl) : `${origin}/favicon.ico`;

  // Logo: first <img> where class, id, alt, or src contains "logo"
  const imgTagMatches = html.matchAll(/<img([^>]+)>/gi);
  for (const [, attrs] of imgTagMatches) {
    const hasLogo = /(?:class|id|alt|src)=["'][^"']*logo[^"']*["']/i.test(attrs);
    if (hasLogo) {
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
      if (srcMatch?.[1]) {
        data.logoUrl = resolveUrl(srcMatch[1], pageUrl);
        break;
      }
    }
  }

  // Brand color: theme-color meta (hex only)
  const themeColor = extractMetaContent(html, [
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
  ]);
  if (themeColor && /^#[0-9a-f]{3,6}$/i.test(themeColor.trim())) {
    data.brandColor = themeColor.trim();
  }

  // Strip undefined keys
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  return NextResponse.json({ success: true, data: clean });
}
