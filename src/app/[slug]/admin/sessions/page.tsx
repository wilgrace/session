import { getSessions } from "@/app/actions/session"
import { CalendarPage } from "@/components/admin/calendar-page"
import { getTenantFromHeaders } from "@/lib/tenant-utils"

// Force dynamic rendering since we use auth() which requires headers
export const dynamic = 'force-dynamic'

export default async function Page() {
  const [{ data: sessions, error }, org] = await Promise.all([
    getSessions(),
    getTenantFromHeaders(),
  ])

  if (error) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="text-red-500">Error loading sessions: {error}</div>
        <div className="text-sm text-gray-500 mt-2">
          Check server logs for more details. Error code and details should be logged in the terminal.
        </div>
      </div>
    )
  }

  return (
    <CalendarPage
      initialSessions={sessions || []}
      defaultSessionImageUrl={org?.defaultSessionImageUrl ?? null}
    />
  )
}
