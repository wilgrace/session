import { ImageResponse } from "next/og"
import { getOrganizationBySlug } from "@/lib/tenant-utils"

export const runtime = "edge"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const size = searchParams.get("size") === "192" ? 192 : 512
  const org = await getOrganizationBySlug(slug)

  const bg = org?.brandColor ?? "#0ea5e9"
  const imageUrl = org?.faviconUrl ?? org?.logoUrl ?? null
  const initial = (org?.name ?? "S")[0].toUpperCase()
  const imgSize = Math.round(size * 0.65)

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            width={imgSize}
            height={imgSize}
            style={{ objectFit: "contain" }}
            alt=""
          />
        ) : (
          <div
            style={{
              color: "#ffffff",
              fontSize: size * 0.45,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {initial}
          </div>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
      },
    }
  )
}
