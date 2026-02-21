import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTenantFromHeaders, getOrganizationBySlug } from "@/lib/tenant-utils"
import { SlugProvider } from "@/lib/slug-context"
import { hexToHSL, getForegroundHSL } from "@/lib/color-utils"
import { getBaseUrl } from "@/lib/site-config"

// iOS device sizes for PWA splash screens (logical pixels, portrait)
// URLs use 3× physical pixels for @3x retina screens
const SPLASH_SIZES = [
  { w: 430, h: 932,  dpr: 3 }, // iPhone 15 Pro Max, 14 Pro Max
  { w: 393, h: 852,  dpr: 3 }, // iPhone 15 Pro, 15
  { w: 390, h: 844,  dpr: 3 }, // iPhone 14, 13, 12
  { w: 428, h: 926,  dpr: 3 }, // iPhone 13 Pro Max, 12 Pro Max
  { w: 375, h: 812,  dpr: 3 }, // iPhone X, XS, 11 Pro, 13 mini
  { w: 414, h: 896,  dpr: 2 }, // iPhone XR, 11, XS Max
  { w: 768, h: 1024, dpr: 2 }, // iPad
  { w: 834, h: 1194, dpr: 2 }, // iPad Pro 11"
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
  const title = `Book a session at ${org.name}`
  const description = org.description || `Book your sessions at ${org.name}`

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
    appleWebApp: { title: org.name },
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

  return (
    <SlugProvider slug={slug}>
      {/* iOS PWA splash screens — React 19 hoists these <link> tags to <head> */}
      {SPLASH_SIZES.map(({ w, h, dpr }) => (
        <link
          key={`${w}x${h}`}
          rel="apple-touch-startup-image"
          href={`/api/og/splash/${slug}?width=${w * dpr}&height=${h * dpr}`}
          media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
        />
      ))}
      <div style={brandStyle}>
        {children}
      </div>
    </SlugProvider>
  )
}
