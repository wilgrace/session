import { notFound } from "next/navigation"
import { getTenantFromHeaders } from "@/lib/tenant-utils"
import { SlugProvider } from "@/lib/slug-context"

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

  return (
    <SlugProvider slug={slug}>
      {children}
    </SlugProvider>
  )
}
