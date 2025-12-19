import { getSessions } from "@/app/actions/session"
import { CalendarPage } from "@/components/admin/calendar-page"

// Force dynamic rendering since we use auth() which requires headers
export const dynamic = 'force-dynamic'

export default async function Page() {
  const { data: sessions, error } = await getSessions()

  if (error) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="text-red-500">Error loading sessions: {error}</div>
      </div>
    )
  }

  return <CalendarPage initialSessions={sessions || []} />
}
