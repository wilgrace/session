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

const BG_URL_RE = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i;
const HERO_KEYWORDS_RE = /(?:hero|banner|cover|jumbotron|slider|intro|masthead|splash)/i;
const WIDE_TAGS_RE = /^(?:section|header|main|article|figure)$/i;

/**
 * Extract background-image URLs from CSS rules whose selectors mention hero/section keywords.
 * Also used for the "next section" — broad selector match covers first + second sections.
 */
function extractBgImageFromCssRules(css: string, baseUrl: string): string | undefined {
  const ruleRe = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1];
    const body = m[2];
    if (!HERO_KEYWORDS_RE.test(selector) && !/\bsection\b|\bheader\b/.test(selector)) continue;
    const urlMatch = body.match(BG_URL_RE);
    if (urlMatch?.[1] && !urlMatch[1].startsWith('data:')) return resolveUrl(urlMatch[1], baseUrl);
  }
  return undefined;
}

/**
 * Find a background-image URL from hero/section containers.
 * Priority:
 *   1. Inline style on section/header/article or any element with a hero keyword in class/id,
 *      where the element is inherently wide (block tag) or has explicit width >= 400px.
 *   2. <style> block CSS rules targeting hero/section selectors.
 */
function findHeroBgImage(html: string, baseUrl: string): string | undefined {
  // 1. Inline style on wide/hero elements
  const elementRe = /<(section|header|main|article|div|figure)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = elementRe.exec(html)) !== null) {
    const tag = m[1];
    const attrs = m[2];
    const className = attrs.match(/class=["']([^"']+)["']/i)?.[1] ?? '';
    const idName = attrs.match(/id=["']([^"']+)["']/i)?.[1] ?? '';
    const style = attrs.match(/style=["']([^"']+)["']/i)?.[1] ?? '';

    const styleWidth = parseInt(style.match(/width\s*:\s*(\d+)px/i)?.[1] ?? '0');
    const attrWidth = parseInt(attrs.match(/\bwidth=["']?(\d+)/i)?.[1] ?? '0');
    const explicitWidth = styleWidth || attrWidth;

    const isWide =
      WIDE_TAGS_RE.test(tag) ||
      HERO_KEYWORDS_RE.test(className) ||
      HERO_KEYWORDS_RE.test(idName) ||
      explicitWidth >= 400;
    if (!isWide) continue;

    const urlMatch = style.match(BG_URL_RE);
    if (urlMatch?.[1] && !urlMatch[1].startsWith('data:')) {
      return resolveUrl(urlMatch[1], baseUrl);
    }
  }

  // 2. <style> blocks targeting hero/section selectors
  const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleBlockRe.exec(html)) !== null) {
    const url = extractBgImageFromCssRules(m[1], baseUrl);
    if (url) return url;
  }

  return undefined;
}

/** Find the src (or data-src for lazy images) of the first large img tag. */
function findHeroImgTag(html: string, baseUrl: string): string | undefined {
  // Images nested in hero containers
  const heroPatterns = [
    /class="[^"]*(?:hero|banner|cover|jumbotron|header-image|wp-block-cover)[^"]*"[^>]*>(?:(?!<\/section|<\/div|<\/header).)*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is,
    /id="[^"]*(?:hero|banner|header)[^"]*"[^>]*>(?:(?!<\/section|<\/div).)*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is,
  ];
  for (const re of heroPatterns) {
    const m = html.match(re);
    const url = m?.[1];
    if (url && !url.startsWith('data:')) return resolveUrl(url, baseUrl);
  }

  // Any img with explicit width >= 600 or height >= 400
  const imgRe = /<img([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    const w = parseInt(attrs.match(/\bwidth=["']?(\d+)/i)?.[1] ?? '0');
    const h = parseInt(attrs.match(/\bheight=["']?(\d+)/i)?.[1] ?? '0');
    if (w >= 600 || h >= 400) {
      const src = attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1]
        ?? attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (src && !src.startsWith('data:') && /\.(jpe?g|png|webp|gif)/i.test(src)) {
        return resolveUrl(src, baseUrl);
      }
    }
  }
  return undefined;
}

/**
 * Extract background-color from CSS rules.
 * Priority: selector containing "primary" → any button/anchor/link selector.
 */
function extractButtonColorFromCss(css: string): string | undefined {
  const bgColorRe = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})\b/i;
  let primaryColor: string | undefined;
  let buttonColor: string | undefined;

  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1];
    const body = m[2];
    const bgMatch = body.match(bgColorRe);
    if (!bgMatch) continue;
    const hex = normalizeHex(bgMatch[1]);
    if (!hex || isBoringColor(hex)) continue;

    if (!primaryColor && /primary/i.test(selector)) { primaryColor = hex; continue; }
    if (!buttonColor && /\b(?:button|\.btn\b|a\b)/i.test(selector)) buttonColor = hex;
  }
  return primaryColor ?? buttonColor;
}

/**
 * Find background-color from inline styles on HTML elements.
 * Priority: element with "primary" in class → any <button> or <a>.
 */
function findInlineButtonColor(html: string): string | undefined {
  const bgColorRe = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})\b/i;

  // Elements with "primary" in class (style attr in either order)
  const primaryPatterns = [
    /<[^>]+class=["'][^"']*primary[^"']*["'][^>]+style=["']([^"']+)["'][^>]*>/gi,
    /<[^>]+style=["']([^"']+)["'][^>]+class=["'][^"']*primary[^"']*["'][^>]*>/gi,
  ];
  for (const re of primaryPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const hex = normalizeHex(m[1].match(bgColorRe)?.[1] ?? '');
      if (hex && !isBoringColor(hex)) return hex;
    }
  }

  // Any <button> or <a> with inline background-color
  const btnRe = /<(?:button|a)\b[^>]+style=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(html)) !== null) {
    const hex = normalizeHex(m[1].match(bgColorRe)?.[1] ?? '');
    if (hex && !isBoringColor(hex)) return hex;
  }
  return undefined;
}

/** Extract the first non-boring CSS-variable color from inline <style> blocks. */
function extractInlineStyleColor(html: string): string | undefined {
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) {
    const color = extractColorFromCss(m[1]);
    if (color) return color;
  }
  return undefined;
}

/** Extract the first button/primary color from inline <style> blocks. */
function extractInlineButtonColor(html: string): string | undefined {
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) {
    const color = extractButtonColorFromCss(m[1]);
    if (color) return color;
  }
  return undefined;
}

/** Fetch up to 100 KB of a stylesheet; try CSS variables then button colors. */
async function fetchStylesheetColors(cssUrl: string): Promise<{ cssVar?: string; button?: string }> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(cssUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookASession/1.0)' },
    });
    if (!res.ok || !res.body) return {};

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
    return { cssVar: extractColorFromCss(css), button: extractButtonColorFromCss(css) };
  } catch {
    return {};
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
  // Priority: background-image on hero/section elements → og:image → large <img> tag
  const heroBgSrc = findHeroBgImage(html, pageUrl);
  const ogImage = extractMetaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]);
  const heroSrc = heroBgSrc ?? ogImage ?? findHeroImgTag(html, pageUrl);
  if (heroSrc) {
    const uploaded = await proxyUpload(heroSrc, userId, 'hero', supabase);
    if (uploaded) {
      data.headerImageUrl = uploaded;
      data.defaultSessionImageUrl = uploaded;
    }
  }

  // ── Brand color ──
  // Fetch the first non-font stylesheet once so we can try both CSS vars and button colors.
  let sheetColors: { cssVar?: string; button?: string } = {};
  const cssHref = extractMetaContent(html, [
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/i,
  ]);
  if (cssHref) {
    const cssUrl = resolveUrl(cssHref, pageUrl);
    if (!/fonts\.googleapis\.com/.test(cssUrl)) {
      sheetColors = await fetchStylesheetColors(cssUrl);
    }
  }

  // 1. theme-color meta
  const themeColor = extractMetaContent(html, [
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
  ]);
  if (themeColor) {
    const hex = normalizeHex(themeColor.trim());
    if (hex && !isBoringColor(hex)) data.brandColor = hex;
  }
  // 2. CSS variables in inline <style> blocks
  if (!data.brandColor) data.brandColor = extractInlineStyleColor(html);
  // 3. CSS variables in linked stylesheet
  if (!data.brandColor) data.brandColor = sheetColors.cssVar;
  // 4. Button/primary background-color in inline <style> blocks
  if (!data.brandColor) data.brandColor = extractInlineButtonColor(html);
  // 5. Button/primary background-color in linked stylesheet
  if (!data.brandColor) data.brandColor = sheetColors.button;
  // 6. Inline background-color on primary/button/anchor elements in the HTML
  if (!data.brandColor) data.brandColor = findInlineButtonColor(html);

  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return NextResponse.json({ success: true, data: clean });
}
