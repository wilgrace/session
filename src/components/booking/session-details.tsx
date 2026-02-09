"use client"

import { format } from "date-fns"
import Image from "next/image"
import { SessionTemplate } from "@/types/session"

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
  // Calculate total spots booked, including current user's spots
  const totalSpotsBooked =
    (session.instances?.reduce((total, instance) => {
      return total + (instance.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0)
    }, 0) || 0) + currentUserSpots

  // Calculate spots remaining
  const spotsRemaining = session.capacity - totalSpotsBooked

  return (
    <div>
      {/* Session Image */}
      {session.image_url && (
        <div className="relative w-full h-48 md:h-64 rounded-lg overflow-hidden">
          <Image
            src={session.image_url}
            alt={session.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}
      <div className="py-6 space-y-4">
        <div>
          {startTime && (
            <h2 className="text-2xl font-bold">
              {format(startTime, "HH:mm")} - {format(startTime, "EEEE d MMMM")}
            </h2>
          )}
          <p className="text-muted-foreground text-lg">{session.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Duration</h3>
            <p className="font-medium">{session.duration_minutes} minutes</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Availability</h3>
            <p className="font-medium">
              {spotsRemaining > 0 ? `${spotsRemaining} of ${session.capacity}` : 'Full'}
            </p>
          </div>
        </div>

        <p className="text-muted-foreground">{session.description}</p>
      </div>
    </div>
  )
}
