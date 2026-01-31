import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getTenantFromHeaders } from "@/lib/tenant-utils"
import { AccountPageClient } from "./account-client"
import { Loader2 } from "lucide-react"

interface AccountPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function AccountPage({ params }: AccountPageProps) {
  const resolvedParams = await params
  const { userId } = await auth()
  const tenant = await getTenantFromHeaders()

  // Require authentication
  if (!userId) {
    redirect(`/sign-in?redirect_url=/${resolvedParams.slug}/account`)
  }

  if (!tenant) {
    redirect("/")
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        }
      >
        <AccountPageClient
          slug={resolvedParams.slug}
          organizationId={tenant.organizationId}
        />
      </Suspense>
    </div>
  )
}
