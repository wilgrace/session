"use client"

import { format } from "date-fns"
import Image from "next/image"
import { SessionTemplate } from "@/types/session"
import { getEventColorValues } from "@/lib/event-colors"

interface SessionDetailsProps {
  session: SessionTemplate
  startTime?: Date
  currentUserSpots?: number
}

export function SessionDetails({
  session,
  startTime,
  currentUserSpots = 0,
}: SessionDetailsProps) {
  // Resolve duration from the matching instance (which has schedule-level override applied),
  // falling back to the template-level duration_minutes.
  const durationMinutes = (() => {
    if (startTime && session.instances?.length) {
      const match = session.instances.find(i =>
        new Date(i.start_time).getTime() === startTime.getTime()
      )
      if (match) {
        const ms = new Date(match.end_time).getTime() - new Date(match.start_time).getTime()
        return Math.round(ms / 60000)
      }
    }
    return session.duration_minutes
  })()

  // Calculate total spots booked, including current user's spots
  const totalSpotsBooked =
    (session.instances?.reduce((total, instance) => {
      return total + (instance.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0)
    }, 0) || 0) + currentUserSpots

  // Resolve effective capacity: instance override → template default
  const instance = session.instances?.[0]
  const effectiveCapacity = instance?.capacity_override ?? session.capacity

  // Calculate spots remaining
  const spotsRemaining = effectiveCapacity - totalSpotsBooked

  const eventColor = getEventColorValues(session.event_color)
  // If event_color is an arbitrary hex (legacy data before key-based picker), use it directly
  const dotColor = session.event_color && /^#[0-9a-fA-F]{6}$/.test(session.event_color)
    ? session.event_color
    : eventColor.color500

  return (
    <div>
      {/* Session Image */}
      {session.image_url && (
        <div className="relative w-full h-48 md:h-64 md:rounded-lg overflow-hidden md:px-4">
          <Image
            src={session.image_url}
            alt={session.name}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}
      <div className="pt-4 md:pt-6 space-y-2 px-4 md:px-0">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-muted-foreground flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            {session.name}
          </p>
          {startTime && (
            <h2 className="text-2xl font-bold">
              {format(startTime, "HH:mm")} • {format(startTime, "EEEE d MMMM")}
            </h2>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm text-muted-foreground">Duration</h3>
            <p className="font-medium">{durationMinutes} minutes</p>
          </div>
          <div>
            <h3 className="text-sm text-muted-foreground">Availability</h3>
            <p className="font-medium">
              {spotsRemaining > 0 ? `${spotsRemaining} spaces left` : 'Full'}
            </p>
          </div>
        </div>

        {session.description && (
          <div className="text-muted-foreground prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: session.description }} />
        )}
      </div>
    </div>
  )
}
