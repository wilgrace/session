import { NextResponse } from "next/server"
import { getOrganizationBySlug } from "@/lib/tenant-utils"
import { getBaseUrl } from "@/lib/site-config"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)
  const baseUrl = getBaseUrl()

  const manifest = {
    name: org?.name ?? "Sawna",
    short_name: org?.name?.slice(0, 12) ?? "Sawna",
    description: "Book your sessions",
    start_url: `${baseUrl}/${slug}`,
    scope: `${baseUrl}/${slug}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: org?.brandColor ?? "#0ea5e9",
    orientation: "portrait",
    icons: [
      {
        src: `/api/og/pwa-icon/${slug}?size=192`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `/api/og/pwa-icon/${slug}?size=512`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `/api/og/pwa-icon/${slug}?size=512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  })
}
