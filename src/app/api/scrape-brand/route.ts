import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import metascraper from 'metascraper';
import metascraperLogo from 'metascraper-logo';
import metascraperImage from 'metascraper-image';
import { Vibrant } from 'node-vibrant/node';

const scraper = metascraper([metascraperLogo(), metascraperImage()]);

interface BrandData {
  description?: string;
  logoUrl?: string;
  faviconUrl?: string;
  headerImageUrl?: string;
  defaultSessionImageUrl?: string;
  brandColor?: string;
  instagramUrl?: string;
  facebookUrl?: string;
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

async function extractVibrantColor(buffer: Buffer): Promise<string | undefined> {
  try {
    const palette = await Vibrant.from(buffer).getPalette();
    const swatches = [palette.Vibrant, palette.DarkVibrant, palette.Muted, palette.DarkMuted];
    for (const swatch of swatches) {
      if (swatch && !isBoringColor(swatch.hex)) return swatch.hex;
    }
  } catch { /* ignore */ }
  return undefined;
}

function extractColorFromCss(css: string): string | undefined {
  const pattern = /--(?:primary|brand|brand-color|color-primary|primary-color|accent|theme-color|main-color|highlight)\s*:\s*(#[0-9a-f]{3,6})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const color = normalizeHex(match[1]);
    if (color && !isBoringColor(color)) return color;
  }
  return undefined;
}

function extractButtonColorFromCss(css: string): string | undefined {
  const bgColorRe = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})\b/i;
  let primaryColor: string | undefined;
  let buttonColor: string | undefined;
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const bgMatch = m[2].match(bgColorRe);
    if (!bgMatch) continue;
    const hex = normalizeHex(bgMatch[1]);
    if (!hex || isBoringColor(hex)) continue;
    if (!primaryColor && /primary/i.test(m[1])) { primaryColor = hex; continue; }
    if (!buttonColor && /\b(?:button|\.btn\b|a\b)/i.test(m[1])) buttonColor = hex;
  }
  return primaryColor ?? buttonColor;
}

// ─── Image helpers ────────────────────────────────────────────────────────────

const BUCKET = 'session-images';
const SKIP_TYPES = new Set(['image/x-icon', 'image/vnd.microsoft.icon']);

interface ImageFetch { buffer: Buffer; contentType: string }

async function fetchImageBuffer(imageUrl: string): Promise<ImageFetch | undefined> {
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
    if (!contentType.startsWith('image/') || SKIP_TYPES.has(contentType)) return undefined;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) return undefined;
    return { buffer, contentType };
  } catch { return undefined; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadBuffer(img: ImageFetch, userId: string, label: string, supabase: any): Promise<string | undefined> {
  const ext = img.contentType.split('/')[1] || 'jpg';
  const filePath = `onboarding/${userId}-${label}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(filePath, img.buffer, {
    contentType: img.contentType,
    upsert: false,
  });
  if (error) return undefined;
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl as string;
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
const HERO_RE = /(?:hero|banner|cover|jumbotron|slider|intro|masthead|splash)/i;
const WIDE_TAGS_RE = /^(?:section|header|main|article|figure)$/i;

function extractBgImageFromCssRules(css: string, baseUrl: string): string | undefined {
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    if (!HERO_RE.test(m[1]) && !/\bsection\b|\bheader\b/.test(m[1])) continue;
    const urlMatch = m[2].match(BG_URL_RE);
    if (urlMatch?.[1] && !urlMatch[1].startsWith('data:')) return resolveUrl(urlMatch[1], baseUrl);
  }
  return undefined;
}

function findHeroBgImage(html: string, baseUrl: string): string | undefined {
  // 1. Inline styles on wide/hero elements
  const elementRe = /<(section|header|main|article|div|figure)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = elementRe.exec(html)) !== null) {
    const attrs = m[2];
    const className = attrs.match(/class=["']([^"']+)["']/i)?.[1] ?? '';
    const idName = attrs.match(/id=["']([^"']+)["']/i)?.[1] ?? '';
    const style = attrs.match(/style=["']([^"']+)["']/i)?.[1] ?? '';
    const styleWidth = parseInt(style.match(/width\s*:\s*(\d+)px/i)?.[1] ?? '0');
    const attrWidth = parseInt(attrs.match(/\bwidth=["']?(\d+)/i)?.[1] ?? '0');
    const isWide = WIDE_TAGS_RE.test(m[1]) || HERO_RE.test(className) || HERO_RE.test(idName) || (styleWidth || attrWidth) >= 400;
    if (!isWide) continue;
    const urlMatch = style.match(BG_URL_RE);
    if (urlMatch?.[1] && !urlMatch[1].startsWith('data:')) return resolveUrl(urlMatch[1], baseUrl);
  }
  // 2. <style> blocks
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(html)) !== null) {
    const url = extractBgImageFromCssRules(m[1], baseUrl);
    if (url) return url;
  }
  return undefined;
}

function findHeroImgTag(html: string, baseUrl: string): string | undefined {
  const heroPatterns = [
    /class="[^"]*(?:hero|banner|cover|jumbotron|header-image|wp-block-cover)[^"]*"[^>]*>(?:(?!<\/section|<\/div|<\/header).)*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is,
    /id="[^"]*(?:hero|banner|header)[^"]*"[^>]*>(?:(?!<\/section|<\/div).)*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/is,
  ];
  for (const re of heroPatterns) {
    const m = html.match(re);
    if (m?.[1] && !m[1].startsWith('data:')) return resolveUrl(m[1], baseUrl);
  }
  const imgRe = /<img([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    const w = parseInt(attrs.match(/\bwidth=["']?(\d+)/i)?.[1] ?? '0');
    const h = parseInt(attrs.match(/\bheight=["']?(\d+)/i)?.[1] ?? '0');
    if (w >= 600 || h >= 400) {
      const src = attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ?? attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (src && !src.startsWith('data:') && /\.(jpe?g|png|webp|gif)/i.test(src)) return resolveUrl(src, baseUrl);
    }
  }
  return undefined;
}

/** Find logo via img attributes containing "logo" (alt, src, class, data-src). */
function findLogoImgTag(html: string, baseUrl: string): string | undefined {
  const imgRe = /<img([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/(?:alt|src|class|data-src)=["'][^"']*logo[^"']*["']/i.test(attrs)) continue;
    const src = attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ?? attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src && !src.startsWith('data:')) return resolveUrl(src, baseUrl);
  }
  return undefined;
}

function findSocialLinks(html: string): { instagramUrl?: string; facebookUrl?: string } {
  const igMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/)[^"'\s?#/][^"'\s?#]*)/i);
  const fbMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|dialog)[^"'\s?#/][^"'\s?#]*)/i);
  return {
    instagramUrl: igMatch?.[1],
    facebookUrl: fbMatch?.[1],
  };
}

function findInlineButtonColor(html: string): string | undefined {
  const bgColorRe = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})\b/i;
  for (const re of [
    /<[^>]+class=["'][^"']*primary[^"']*["'][^>]+style=["']([^"']+)["'][^>]*>/gi,
    /<[^>]+style=["']([^"']+)["'][^>]+class=["'][^"']*primary[^"']*["'][^>]*>/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const hex = normalizeHex(m[1].match(bgColorRe)?.[1] ?? '');
      if (hex && !isBoringColor(hex)) return hex;
    }
  }
  const btnRe = /<(?:button|a)\b[^>]+style=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(html)) !== null) {
    const hex = normalizeHex(m[1].match(bgColorRe)?.[1] ?? '');
    if (hex && !isBoringColor(hex)) return hex;
  }
  return undefined;
}

async function fetchStylesheetColors(cssUrl: string): Promise<{ cssVar?: string; button?: string }> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(cssUrl, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookASession/1.0)' } });
    if (!res.ok || !res.body) return {};
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let css = '', bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      css += decoder.decode(value, { stream: true });
      bytes += value.length;
      if (bytes >= 100 * 1024) { reader.cancel(); break; }
    }
    return { cssVar: extractColorFromCss(css), button: extractButtonColorFromCss(css) };
  } catch { return {}; }
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
    pageUrl = res.url || pageUrl;
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch URL' });
  } finally {
    clearTimeout(pageTimeout);
  }

  const supabase = createSupabaseServerClient();
  const data: BrandData = {};

  // ── Run metascraper for logo + image ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: Record<string, string> = await (scraper as any)({ html, url: pageUrl }).catch(() => ({}));

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
    const img = await fetchImageBuffer(resolveUrl(faviconHref, pageUrl));
    if (img) data.faviconUrl = await uploadBuffer(img, userId, 'favicon', supabase);
  }

  // ── Logo ──
  // 1. metascraper-logo; 2. img with "logo" in alt/src/class/data-src
  const logoSrc = meta.logo
    ? resolveUrl(meta.logo, pageUrl)
    : findLogoImgTag(html, pageUrl);

  let logoBuffer: Buffer | undefined;
  if (logoSrc) {
    const img = await fetchImageBuffer(logoSrc);
    if (img) {
      data.logoUrl = await uploadBuffer(img, userId, 'logo', supabase);
      logoBuffer = img.buffer;
    }
  }

  // ── Hero / header + session image ──
  // 1. background-image in hero sections; 2. metascraper-image; 3. large <img>
  const heroBgSrc = findHeroBgImage(html, pageUrl);
  const heroSrc = heroBgSrc
    ?? (meta.image ? resolveUrl(meta.image, pageUrl) : undefined)
    ?? findHeroImgTag(html, pageUrl);

  if (heroSrc) {
    const img = await fetchImageBuffer(heroSrc);
    if (img) {
      const url = await uploadBuffer(img, userId, 'hero', supabase);
      if (url) { data.headerImageUrl = url; data.defaultSessionImageUrl = url; }
    }
  }

  // ── Brand color ──
  // Fetch stylesheet once for CSS var + button color fallbacks
  const cssHref = extractMetaContent(html, [
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/i,
  ]);
  let sheetColors: { cssVar?: string; button?: string } = {};
  if (cssHref) {
    const cssUrl = resolveUrl(cssHref, pageUrl);
    if (!/fonts\.googleapis\.com/.test(cssUrl)) sheetColors = await fetchStylesheetColors(cssUrl);
  }

  // 1. node-vibrant from logo buffer
  if (logoBuffer) data.brandColor = await extractVibrantColor(logoBuffer);

  // 2. theme-color meta
  if (!data.brandColor) {
    const themeColor = extractMetaContent(html, [
      /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
    ]);
    if (themeColor) {
      const hex = normalizeHex(themeColor.trim());
      if (hex && !isBoringColor(hex)) data.brandColor = hex;
    }
  }

  // 3. CSS variables in inline <style> blocks
  if (!data.brandColor) {
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m: RegExpExecArray | null;
    while ((m = styleRe.exec(html)) !== null) {
      const c = extractColorFromCss(m[1]);
      if (c) { data.brandColor = c; break; }
    }
  }
  // 4. CSS variables in linked stylesheet
  if (!data.brandColor) data.brandColor = sheetColors.cssVar;
  // 5. Button/primary background-color in inline <style> blocks
  if (!data.brandColor) {
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m: RegExpExecArray | null;
    while ((m = styleRe.exec(html)) !== null) {
      const c = extractButtonColorFromCss(m[1]);
      if (c) { data.brandColor = c; break; }
    }
  }
  // 6. Button/primary background-color in linked stylesheet
  if (!data.brandColor) data.brandColor = sheetColors.button;
  // 7. Inline background-color on primary/button elements
  if (!data.brandColor) data.brandColor = findInlineButtonColor(html);

  // ── Social links ──
  const social = findSocialLinks(html);
  if (social.instagramUrl) data.instagramUrl = social.instagramUrl;
  if (social.facebookUrl) data.facebookUrl = social.facebookUrl;

  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return NextResponse.json({ success: true, data: clean });
}
