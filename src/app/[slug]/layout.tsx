import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTenantFromHeaders, getOrganizationBySlug } from "@/lib/tenant-utils"
import { SlugProvider } from "@/lib/slug-context"
import { hexToHSL, getForegroundHSL } from "@/lib/color-utils"
import { getBaseUrl } from "@/lib/site-config"
import { SplashWarmer } from "@/components/splash-warmer"

// iOS device sizes for PWA splash screens (logical pixels × DPR = physical image pixels)
// Media queries use logical points; image dimensions use physical pixels (w×dpr, h×dpr)
const SPLASH_SIZES = [
  // ── iPhone 16 series ──────────────────────────────────────────
  { w: 440, h: 956,  dpr: 3 }, // iPhone 16 Pro Max
  { w: 430, h: 932,  dpr: 3 }, // iPhone 16 Plus
  { w: 402, h: 874,  dpr: 3 }, // iPhone 16 Pro
  { w: 390, h: 844,  dpr: 3 }, // iPhone 16
  // ── iPhone 15 series ──────────────────────────────────────────
  { w: 430, h: 932,  dpr: 3 }, // iPhone 15 Pro Max, 15 Plus  (same logical size as 16 Plus)
  { w: 393, h: 852,  dpr: 3 }, // iPhone 15 Pro, 15
  // ── iPhone 14 series ──────────────────────────────────────────
  { w: 430, h: 932,  dpr: 3 }, // iPhone 14 Pro Max           (same as above, deduped by key)
  { w: 393, h: 852,  dpr: 3 }, // iPhone 14 Pro               (same as 15 Pro, deduped)
  { w: 428, h: 926,  dpr: 3 }, // iPhone 14 Plus
  { w: 390, h: 844,  dpr: 3 }, // iPhone 14                   (same as 16, deduped)
  // ── iPhone 12 / 13 series ─────────────────────────────────────
  { w: 428, h: 926,  dpr: 3 }, // iPhone 13 Pro Max, 12 Pro Max (deduped)
  { w: 390, h: 844,  dpr: 3 }, // iPhone 13, 13 Pro, 12, 12 Pro (deduped)
  { w: 375, h: 812,  dpr: 3 }, // iPhone 13 mini, 12 mini
  // ── iPhone X / XS / 11 series ─────────────────────────────────
  { w: 414, h: 896,  dpr: 3 }, // iPhone XS Max, 11 Pro Max
  { w: 414, h: 896,  dpr: 2 }, // iPhone XR, 11
  { w: 375, h: 812,  dpr: 3 }, // iPhone X, XS, 11 Pro        (deduped)
  // ── iPhone SE ─────────────────────────────────────────────────
  { w: 375, h: 667,  dpr: 2 }, // iPhone SE (2nd & 3rd gen)
  // ── iPad ──────────────────────────────────────────────────────
  { w: 768, h: 1024, dpr: 2 }, // iPad (9th/10th gen), iPad mini
  { w: 834, h: 1194, dpr: 2 }, // iPad Pro 11", iPad Air
  { w: 1024,h: 1366, dpr: 2 }, // iPad Pro 12.9"
]

interface SlugLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)

  if (!org) {
    return {}
  }

  const baseUrl = getBaseUrl()
  const title = `Book a Session | ${org.name}`
  const description = org.description || `Book a Session at ${org.name}`

  const icons: Metadata["icons"] = {}
  if (org.faviconUrl) {
    icons.icon = org.faviconUrl
  }
  // Use the generated PWA icon as the apple touch icon so it uses brand colours
  icons.apple = `/api/og/pwa-icon/${slug}?size=512`

  return {
    title,
    description,
    icons,
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: org.name,
    },
    ...(org.brandColor && {
      other: { "theme-color": org.brandColor },
    }),
    openGraph: {
      title,
      description,
      ...(org.defaultSessionImageUrl && {
        images: [{ url: org.defaultSessionImageUrl }],
      }),
      url: `${baseUrl}/${slug}`,
      siteName: org.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(org.defaultSessionImageUrl && {
        images: [org.defaultSessionImageUrl],
      }),
    },
  }
}

export default async function SlugLayout({
  children,
  params,
}: SlugLayoutProps) {
  const { slug } = await params
  const tenant = await getTenantFromHeaders()

  // If middleware didn't set headers, the org doesn't exist
  if (!tenant) {
    notFound()
  }

  // Fetch org branding for CSS variable overrides
  const organization = await getOrganizationBySlug(slug)
  const brandColor = organization?.brandColor
  const brandTextColor = organization?.brandTextColor
  const brandStyle = brandColor
    ? {
        "--primary": hexToHSL(brandColor),
        "--primary-foreground": brandTextColor
          ? hexToHSL(brandTextColor)
          : getForegroundHSL(brandColor),
        "--ring": hexToHSL(brandColor),
      } as React.CSSProperties
    : undefined

  // Deduplicate splash sizes — same logical dimensions at same DPR = same image
  const seen = new Set<string>()
  const uniqueSplashSizes = SPLASH_SIZES.filter(({ w, h, dpr }) => {
    const key = `${w}x${h}x${dpr}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <>
      {/* iOS PWA splash screens — rendered as direct Server Component output so
          Next.js SSRs them into <head> reliably, outside the Client Component wrapper */}
      {uniqueSplashSizes.map(({ w, h, dpr }) => (
        <link
          key={`${w}x${h}x${dpr}`}
          rel="apple-touch-startup-image"
          href={`/api/og/splash/${slug}?width=${w * dpr}&height=${h * dpr}`}
          media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
        />
      ))}
      <SlugProvider slug={slug}>
        <div style={brandStyle}>
          <SplashWarmer />
          {children}
        </div>
      </SlugProvider>
    </>
  )
}
