import { notFound } from "next/navigation"
import { getTenantFromHeaders, getOrganizationBySlug } from "@/lib/tenant-utils"
import { SlugProvider } from "@/lib/slug-context"
import { hexToHSL, getForegroundHSL } from "@/lib/color-utils"

interface SlugLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
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
