"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionForm } from "@/components/admin/session-form"
import { SessionTemplate } from "@/types/session"

const CalendarView = dynamic(
  () => import("@/components/admin/calendar-view").then((mod) => ({ default: mod.CalendarView })),
  { loading: () => <Skeleton className="h-[600px] w-full" />, ssr: false }
)

interface CalendarPageProps {
  initialSessions: SessionTemplate[]
  defaultSessionImageUrl?: string | null
  defaultDropinPrice?: number | null
}

export function CalendarPage({ initialSessions, defaultSessionImageUrl, defaultDropinPrice }: CalendarPageProps) {
  const [sessions, setSessions] = useState(initialSessions)
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionTemplate | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: Date; end: Date } | null>(null)

  useEffect(() => {
    const handleOpenForm = () => setShowSessionForm(true)
    window.addEventListener('openSessionForm', handleOpenForm)
    return () => window.removeEventListener('openSessionForm', handleOpenForm)
  }, [])

  const handleCreateSession = (start: Date, end: Date) => {
    setSelectedTimeSlot({ start, end })
    setShowSessionForm(true)
  }

  return (
    <div className="flex-1 space-y-4 pt-0">
      {!sessions || sessions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No sessions found. Click "New Session" to create one.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <CalendarView 
            sessions={sessions} 
            onEditSession={(session) => {
              setSelectedSession(session)
              setShowSessionForm(true)
            }}
            onCreateSession={handleCreateSession}
            showControls={false}
          />
        </div>
      )}

      <SessionForm
        open={showSessionForm}
        onClose={() => {
          setShowSessionForm(false)
          setSelectedSession(null)
          setSelectedTimeSlot(null)
        }}
        template={selectedSession}
        initialTimeSlot={selectedTimeSlot}
        defaultSessionImageUrl={defaultSessionImageUrl}
        defaultDropinPrice={defaultDropinPrice}
        onSuccess={() => {
          // Refresh the page to get new data
          window.location.reload()
        }}
      />

    </div>
  )
} 