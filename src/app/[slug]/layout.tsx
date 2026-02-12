import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTenantFromHeaders, getOrganizationBySlug } from "@/lib/tenant-utils"
import { SlugProvider } from "@/lib/slug-context"
import { hexToHSL, getForegroundHSL } from "@/lib/color-utils"
import { getBaseUrl } from "@/lib/site-config"

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
  if (org.logoUrl) {
    icons.apple = org.logoUrl
  }

  return {
    title,
    description,
    icons,
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
    ...(org.logoUrl && {
      manifest: undefined,
      other: {
        "apple-mobile-web-app-title": org.name,
      },
    }),
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
      <div style={brandStyle}>
        {children}
      </div>
    </SlugProvider>
  )
}
