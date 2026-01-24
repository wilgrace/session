"use client"

import { useState } from "react"
import { format, isSameDay } from "date-fns"
import { SessionTemplate } from "@/types/session"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { LockedSessionDialog } from "./locked-session-tooltip"

interface MobileSessionListProps {
  sessions: SessionTemplate[]
  selectedDate: Date
  slug: string
  isAdmin?: boolean
}

export function MobileSessionList({ sessions, selectedDate, slug, isAdmin = false }: MobileSessionListProps) {
  const router = useRouter()
  const [lockedDialog, setLockedDialog] = useState<{ open: boolean; sessionName: string }>({
    open: false,
    sessionName: ''
  })

  // isAdmin is now passed as a prop from the server component

  // Filter sessions for the selected date
  const filteredSessions = sessions.filter((template) => {
    // Check if any instance matches this day
    if (template.instances) {
      return template.instances.some(instance => {
        // JavaScript will automatically convert UTC to local time
        const instanceDate = new Date(instance.start_time)
        return isSameDay(instanceDate, selectedDate)
      })
    }
    
    // Check if any recurring schedule matches this day
    if (template.is_recurring && template.schedules) {
      const dayName = format(selectedDate, 'EEEE').toLowerCase()
      return template.schedules.some(schedule => 
        schedule.days.some(scheduleDay => 
          scheduleDay.toLowerCase() === dayName
        )
      )
    }
    
    return false
  })

  const handleSessionClick = (template: SessionTemplate, startTime: Date) => {
    // For free sessions, only admins can book - others see dialog
    if (template.pricing_type === 'free' && !isAdmin) {
      setLockedDialog({ open: true, sessionName: template.name })
      return
    }
    router.push(`/${slug}/${template.id}?start=${startTime.toISOString()}`)
  }

  if (filteredSessions.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No sessions available for this day
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {filteredSessions.map((template) => {
        // Get all instances for this day
        const dayInstances = template.instances?.filter(instance => {
          // JavaScript will automatically convert UTC to local time
          const instanceDate = new Date(instance.start_time)
          return isSameDay(instanceDate, selectedDate)
        }) || []

        // If no instances, create one from the schedule
        if (dayInstances.length === 0 && template.is_recurring && template.schedules) {
          const dayName = format(selectedDate, 'EEEE').toLowerCase()
          const schedule = template.schedules.find(s => 
            s.days.some(d => d.toLowerCase() === dayName)
          )
          
          if (schedule) {
            const [hours, minutes] = schedule.time.split(':').map(Number)
            const startTime = new Date(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate(),
              hours,
              minutes,
              0,
              0
            )
            
            const isFreeSession = template.pricing_type === 'free'
            return (
              <Card
                key={`${template.id}-${startTime.toISOString()}`}
                className={isFreeSession && !isAdmin ? 'border-amber-300 bg-amber-50' : ''}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium flex items-center gap-1">
                        {isFreeSession && <Lock className="h-3 w-3 text-amber-600" />}
                        {template.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {format(startTime, "h:mm a")}
                      </p>
                      {isFreeSession && !isAdmin && (
                        <Badge variant="secondary" className="mt-1 bg-amber-100 text-amber-800 text-xs">
                          Contact for details
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant={isFreeSession && !isAdmin ? "secondary" : "outline"}
                      onClick={() => handleSessionClick(template, startTime)}
                    >
                      {isFreeSession && !isAdmin ? 'Info' : 'Book'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          }
        }

        // Render each instance
        return dayInstances.map(instance => {
          // JavaScript will automatically convert UTC to local time
          const startTime = new Date(instance.start_time)
          const isFreeSession = template.pricing_type === 'free'
          return (
            <Card
              key={instance.id}
              className={isFreeSession && !isAdmin ? 'border-amber-300 bg-amber-50' : ''}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium flex items-center gap-1">
                      {isFreeSession && <Lock className="h-3 w-3 text-amber-600" />}
                      {template.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {format(startTime, "h:mm a")}
                    </p>
                    {isFreeSession && !isAdmin && (
                      <Badge variant="secondary" className="mt-1 bg-amber-100 text-amber-800 text-xs">
                        Contact for details
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant={isFreeSession && !isAdmin ? "secondary" : "outline"}
                    onClick={() => handleSessionClick(template, startTime)}
                  >
                    {isFreeSession && !isAdmin ? 'Info' : 'Book'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })
      })}

      {/* Locked Session Dialog */}
      <LockedSessionDialog
        open={lockedDialog.open}
        sessionName={lockedDialog.sessionName}
        onOpenChange={(open) => setLockedDialog(prev => ({ ...prev, open }))}
      />
    </div>
  )
} 