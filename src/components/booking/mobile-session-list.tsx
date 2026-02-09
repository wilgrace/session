"use client"

import { format, isSameDay } from "date-fns"
import { SessionTemplate, SessionInstance } from "@/types/session"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Users, EyeOff } from "lucide-react"
import { useUser } from "@clerk/nextjs"

interface MobileSessionListProps {
  sessions: SessionTemplate[]
  selectedDate: Date
  slug: string
  isAdmin?: boolean
}

export function MobileSessionList({ sessions, selectedDate, slug, isAdmin = false }: MobileSessionListProps) {
  const router = useRouter()
  const { user } = useUser()
  // Build a flat list of all sessions for the selected day directly from sessions
  const sessionsForDay = sessions.flatMap((template) => {
    const results: { template: SessionTemplate; startTime: Date; endTime: Date; key: string; instance?: SessionInstance; isBooked: boolean; bookingId?: string }[] = []

    // Check instances for this day
    if (template.instances && template.instances.length > 0) {
      template.instances.forEach(instance => {
        const instanceDate = new Date(instance.start_time)
        if (isSameDay(instanceDate, selectedDate)) {
          const userBooking = instance.bookings?.find(b => b.user?.clerk_user_id === user?.id)
          results.push({
            template,
            startTime: instanceDate,
            endTime: new Date(instance.end_time),
            key: instance.id,
            instance,
            isBooked: !!userBooking,
            bookingId: userBooking?.id,
          })
        }
      })
    }

    // If no instances found, check recurring schedule
    if (results.length === 0 && template.is_recurring && template.schedules) {
      const dayName = format(selectedDate, 'EEEE').toLowerCase()
      const schedule = template.schedules.find(s =>
        s.days.some(d => d.toLowerCase() === dayName)
      )

      if (schedule) {
        const [hours, minutes] = schedule.time.split(':').map(Number)
        const effectiveDuration = schedule.duration_minutes || template.duration_minutes
        const startTime = new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          hours,
          minutes,
          0,
          0
        )
        const endTime = new Date(startTime.getTime() + effectiveDuration * 60000)

        results.push({
          template,
          startTime,
          endTime,
          key: `${template.id}-${startTime.toISOString()}`,
          isBooked: false,
        })
      }
    }

    return results
  })

  // Sort by start time
  sessionsForDay.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  const handleSessionClick = (template: SessionTemplate, startTime: Date, isBooked: boolean, bookingId?: string) => {
    if (isBooked && bookingId) {
      router.push(`/${slug}/${template.id}?start=${startTime.toISOString()}&edit=true&bookingId=${bookingId}`)
      return
    }
    router.push(`/${slug}/${template.id}?start=${startTime.toISOString()}`)
  }

  if (sessionsForDay.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No sessions available for this day
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {sessionsForDay.map(({ template, startTime, endTime, key, instance, isBooked, bookingId }) => {
        const isFreeSession = template.pricing_type === 'free'
        const isHidden = template.visibility === 'hidden'
        const totalCapacity = template.capacity || 10
        const totalSpotsBooked = instance?.bookings?.reduce((sum, b) => sum + (b.number_of_spots || 1), 0) || 0
        const availableSpots = totalCapacity - totalSpotsBooked
        const isFull = availableSpots === 0

        return (
          <Card
            key={key}
            className={
              isBooked ? 'border-primary bg-primary/5' : ''
            }
          >
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium flex items-center gap-1">
                    {isFreeSession && <span className="text-[10px] font-semibold uppercase text-muted-foreground">Free</span>}
                    {isHidden && <EyeOff className="h-3 w-3 text-gray-400" />}
                    {template.name}
                  </h3>
                  <div className="mt-1 flex items-center text-sm text-muted-foreground gap-x-3">
                    <span>{format(startTime, "HH:mm")} - {format(endTime, "HH:mm")}</span>
                    <span className="text-gray-300">·</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {isFull ? 'Waiting List' : availableSpots}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleSessionClick(template, startTime, isBooked, bookingId)}
                >
                  {isBooked ? 'View' : 'Book'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

    </div>
  )
} 