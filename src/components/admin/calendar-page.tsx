"use client"

import { useState, useEffect } from "react"
import { CalendarView } from "@/components/admin/calendar-view"
import { SessionForm } from "@/components/admin/session-form"
import { SessionTemplate } from "@/types/session"
import { deleteSessionTemplate } from "@/app/actions/session"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface CalendarPageProps {
  initialSessions: SessionTemplate[]
}

export function CalendarPage({ initialSessions }: CalendarPageProps) {
  const [sessions, setSessions] = useState(initialSessions)
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionTemplate | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: Date; end: Date } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<SessionTemplate | null>(null)

  useEffect(() => {
    const handleOpenForm = () => setShowSessionForm(true)
    window.addEventListener('openSessionForm', handleOpenForm)
    return () => window.removeEventListener('openSessionForm', handleOpenForm)
  }, [])

  const handleCreateSession = (start: Date, end: Date) => {
    setSelectedTimeSlot({ start, end })
    setShowSessionForm(true)
  }

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;

    const { success, error } = await deleteSessionTemplate(sessionToDelete.id);
    if (success) {
      setSessions(sessions.filter(session => session.id !== sessionToDelete.id));
      setShowDeleteDialog(false);
      setSessionToDelete(null);
    } else {
      alert("Error deleting session: " + error);
    }
  };

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
            onDeleteSession={(session) => {
              setSessionToDelete(session)
              setShowDeleteDialog(true)
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
        onSuccess={() => {
          // Refresh the page to get new data
          window.location.reload()
        }}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the session
              {sessionToDelete && ` "${sessionToDelete.name}"`}
              and all associated schedules and instances.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSession} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 