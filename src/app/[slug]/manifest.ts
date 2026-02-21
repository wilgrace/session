import type { MetadataRoute } from "next"
import { getOrganizationBySlug } from "@/lib/tenant-utils"

export default async function manifest({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<MetadataRoute.Manifest> {
  const { slug } = await params
  const org = await getOrganizationBySlug(slug)

  return {
    name: org?.name ?? "Sawna",
    short_name: org?.name?.slice(0, 12) ?? "Sawna",
    description: "Book your sessions",
    start_url: `/${slug}`,
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
}
