import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

interface BrandData {
  description?: string;
  logoUrl?: string;
  faviconUrl?: string;
  headerImageUrl?: string;
  defaultSessionImageUrl?: string;
  brandColor?: string;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function normalizeHex(raw: string): string | undefined {
  const h = raw.trim().replace(/^#/, '');
  if (h.length === 3) {
    const [r, g, b] = h.split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (h.length === 6) return `#${h}`;
  return undefined;
}

/** Returns true if the color is near-black, near-white, or low-saturation (gray). */
function isBoringColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));
  return l > 0.88 || l < 0.12 || s < 0.25;
}

/** Extract the first interesting hex color from CSS text. */
function extractColorFromCss(css: string): string | undefined {
  const varPatterns = [
    /--(?:primary|brand|brand-color|color-primary|primary-color|accent|theme-color|main-color|highlight)\s*:\s*(#[0-9a-f]{3,6})\b/gi,
  ];
  for (const pattern of varPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(css)) !== null) {
      const color = normalizeHex(match[1]);
      if (color && !isBoringColor(color)) return color;
    }
  }
  return undefined;
}

// ─── Image proxy ──────────────────────────────────────────────────────────────

const BUCKET = 'session-images';
const BORING_CONTENT_TYPES = new Set(['image/x-icon', 'image/vnd.microsoft.icon']);

async function proxyUpload(
  imageUrl: string,
  userId: string,
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(imageUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookASession/1.0)' },
    });
    clearTimeout(t);

    if (!res.ok) return undefined;
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!contentType.startsWith('image/') || BORING_CONTENT_TYPES.has(contentType)) return undefined;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return undefined; // skip >5 MB

    const ext = contentType.split('/')[1] || 'jpg';
    const filePath = `onboarding/${userId}-${label}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(filePath, buf, { contentType, upsert: false });
    if (error) return undefined;

    return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl as string;
  } catch {
    return undefined;
  }
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function resolveUrl(href: string, base: string): string {
  try { return new URL(href, base).href; } catch { return href; }
}

function extractMetaContent(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** Find the src (or data-src for lazy images) of the first large-looking image. */
function findHeroImage(html: string, baseUrl: string): string | undefined {
  // Try common hero container patterns first
  const heroPatterns = [
    /class="[^"]*(?:hero|banner|cover|jumbotron|header-image|wp-block-cover)[^"]*"[^>]*>(?:(?!<\/section|<\/div|<\/header).)*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is,
    /id="[^"]*(?:hero|banner|header)[^"]*"[^>]*>(?:(?!<\/section|<\/div).)*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is,
  ];
  for (const re of heroPatterns) {
    const m = html.match(re);
    const url = m?.[1];
    if (url && !url.startsWith('data:')) return resolveUrl(url, baseUrl);
  }

  // Fall back to first img with explicit large dimensions or a wide srcset
  const imgRe = /<img([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    const widthMatch = attrs.match(/\bwidth=["']?(\d+)/i);
    const heightMatch = attrs.match(/\bheight=["']?(\d+)/i);
    const w = widthMatch ? parseInt(widthMatch[1]) : 0;
    const h = heightMatch ? parseInt(heightMatch[1]) : 0;
    if (w >= 600 || h >= 400) {
      // Prefer data-src (lazy-loaded) then src
      const src = attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1]
        ?? attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (src && !src.startsWith('data:') && /\.(jpe?g|png|webp|gif)/i.test(src)) {
        return resolveUrl(src, baseUrl);
      }
    }
  }
  return undefined;
}

/** Extract the first non-boring color from inline <style> blocks. */
function extractInlineStyleColor(html: string): string | undefined {
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) {
    const color = extractColorFromCss(m[1]);
    if (color) return color;
  }
  return undefined;
}

/** Fetch up to 100 KB of a stylesheet and look for brand colors. */
async function fetchStylesheetColor(cssUrl: string): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(cssUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookASession/1.0)' },
    });
    if (!res.ok || !res.body) return undefined;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let css = '';
    let bytes = 0;
    const MAX = 100 * 1024;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      css += decoder.decode(value, { stream: true });
      bytes += value.length;
      if (bytes >= MAX) { reader.cancel(); break; }
    }
    return extractColorFromCss(css);
  } catch {
    return undefined;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) return NextResponse.json({ success: false, error: 'Missing url param' }, { status: 400 });

  let pageUrl: string;
  try { pageUrl = new URL(rawUrl).href; } catch {
    return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
  }

  // Fetch page HTML
  const ctrl = new AbortController();
  const pageTimeout = setTimeout(() => ctrl.abort(), 8000);
  let html: string;
  try {
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookASession/1.0)' },
    });
    if (!res.ok) return NextResponse.json({ success: false, error: `HTTP ${res.status}` });
    html = await res.text();
    // Update pageUrl to final URL after any redirects
    pageUrl = res.url || pageUrl;
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch URL' });
  } finally {
    clearTimeout(pageTimeout);
  }

  const supabase = createSupabaseServerClient();
  const data: BrandData = {};

  // ── Description ──
  data.description = extractMetaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  ]);

  // ── Favicon ──
  const faviconHref = extractMetaContent(html, [
    /<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+\.(?:svg|png|webp))["']/i,
    /<link[^>]+href=["']([^"']+\.(?:svg|png|webp))["'][^>]+rel=["']icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon(?:-precomposed)?["']/i,
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  ]);
  if (faviconHref) {
    data.faviconUrl = await proxyUpload(resolveUrl(faviconHref, pageUrl), userId, 'favicon', supabase);
  }

  // ── Logo ──
  // 1. JSON-LD Organization.logo
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  let logoSrc: string | undefined;
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      const entries = Array.isArray(ld) ? ld : [ld];
      for (const entry of entries) {
        const logo = entry?.logo ?? entry?.organization?.logo;
        if (typeof logo === 'string') { logoSrc = logo; break; }
        if (typeof logo?.url === 'string') { logoSrc = logo.url; break; }
      }
    } catch { /* ignore */ }
  }
  // 2. img tag with "logo" in any attribute
  if (!logoSrc) {
    const imgRe = /<img([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html)) !== null) {
      if (/(?:class|id|alt|src)=["'][^"']*logo[^"']*["']/i.test(m[1])) {
        logoSrc = m[1].match(/src=["']([^"']+)["']/i)?.[1];
        if (logoSrc) break;
      }
    }
  }
  if (logoSrc) {
    data.logoUrl = await proxyUpload(resolveUrl(logoSrc, pageUrl), userId, 'logo', supabase);
  }

  // ── Header / session image ──
  // 1. og:image
  const ogImage = extractMetaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]);
  const heroSrc = ogImage ?? findHeroImage(html, pageUrl);
  if (heroSrc) {
    const uploaded = await proxyUpload(heroSrc, userId, 'hero', supabase);
    if (uploaded) {
      data.headerImageUrl = uploaded;
      data.defaultSessionImageUrl = uploaded;
    }
  }

  // ── Brand color ──
  // 1. theme-color meta
  const themeColor = extractMetaContent(html, [
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
  ]);
  if (themeColor) {
    const hex = normalizeHex(themeColor.trim());
    if (hex && !isBoringColor(hex)) data.brandColor = hex;
  }

  // 2. Inline <style> blocks
  if (!data.brandColor) {
    data.brandColor = extractInlineStyleColor(html);
  }

  // 3. First linked stylesheet
  if (!data.brandColor) {
    const cssHref = extractMetaContent(html, [
      /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/i,
    ]);
    if (cssHref) {
      const cssUrl = resolveUrl(cssHref, pageUrl);
      // Skip Google Fonts or other font-only sheets
      if (!/fonts\.googleapis\.com/.test(cssUrl)) {
        data.brandColor = await fetchStylesheetColor(cssUrl);
      }
    }
  }

  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return NextResponse.json({ success: true, data: clean });
}
