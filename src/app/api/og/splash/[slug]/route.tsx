import { ImageResponse } from "next/og"
import { getOrganizationBySlug } from "@/lib/tenant-utils"

export const runtime = "edge"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const w = Number(searchParams.get("width")) || 1170
  const h = Number(searchParams.get("height")) || 2532
  const org = await getOrganizationBySlug(slug)

  const bg = org?.brandColor ?? "#0ea5e9"
  const logoUrl = org?.logoUrl ?? org?.faviconUrl ?? null
  const logoSize = Math.round(Math.min(w, h) * 0.28)

  return new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          background: bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            width={logoSize}
            height={logoSize}
            style={{ objectFit: "contain", borderRadius: logoSize * 0.2 }}
            alt=""
          />
        ) : (
          <div
            style={{
              width: logoSize,
              height: logoSize,
              borderRadius: logoSize * 0.2,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: logoSize * 0.5,
              fontWeight: 700,
            }}
          >
            {(org?.name ?? "S")[0].toUpperCase()}
          </div>
        )}
        <div
          style={{
            color: org?.brandTextColor ?? "#ffffff",
            fontSize: Math.round(w * 0.055),
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          {org?.name ?? "Sawna"}
        </div>
      </div>
    ),
    {
      width: w,
      height: h,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
      },
    }
  )
}
