"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionForm } from "@/components/admin/session-form"
import { InstancePanel } from "@/components/admin/instance-panel"
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
  const [instancePanelOpen, setInstancePanelOpen] = useState(false)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)

  useEffect(() => {
    const handleOpenForm = () => setShowSessionForm(true)
    window.addEventListener('openSessionForm', handleOpenForm)
    return () => window.removeEventListener('openSessionForm', handleOpenForm)
  }, [])

  const handleCreateSession = (start: Date, end: Date) => {
    setSelectedTimeSlot({ start, end })
    setShowSessionForm(true)
  }

  const handleSelectInstance = (instanceId: string, _template: SessionTemplate, _instanceStart: Date) => {
    setSelectedInstanceId(instanceId)
    setInstancePanelOpen(true)
  }

  // Find the selected instance from the sessions data
  const selectedInstance = selectedInstanceId
    ? sessions.flatMap(s => s.instances ?? []).find(i => i.id === selectedInstanceId) ?? null
    : null

  // Find the template for the selected instance (needed for template name)
  const selectedInstanceTemplate = selectedInstanceId
    ? sessions.find(s => s.instances?.some(i => i.id === selectedInstanceId)) ?? null
    : null

  // Build the InstancePanelSession shape from what we have
  const instancePanelSession = selectedInstance && selectedInstanceTemplate ? {
    id: selectedInstance.id,
    start_time: selectedInstance.start_time,
    end_time: selectedInstance.end_time,
    status: selectedInstance.status,
    cancelled_at: selectedInstance.cancelled_at ?? undefined,
    cancellation_reason: selectedInstance.cancellation_reason ?? undefined,
    bookings: selectedInstance.bookings?.map(b => ({
      id: b.id,
      status: b.status ?? 'confirmed',
      number_of_spots: b.number_of_spots,
    })),
    template: {
      id: selectedInstanceTemplate.id,
      name: selectedInstanceTemplate.name,
    },
  } : null

  // Get slug from URL path
  const slug = typeof window !== 'undefined'
    ? window.location.pathname.split('/')[1]
    : ''

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
            onSelectInstance={handleSelectInstance}
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
          window.location.reload()
        }}
      />

      <InstancePanel
        open={instancePanelOpen}
        session={instancePanelSession}
        slug={slug}
        onClose={() => {
          setInstancePanelOpen(false)
          setSelectedInstanceId(null)
        }}
        onCancelled={() => {
          setInstancePanelOpen(false)
          setSelectedInstanceId(null)
          window.location.reload()
        }}
      />
    </div>
  )
}
