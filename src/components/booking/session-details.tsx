"use client"

import { format } from "date-fns"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
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
    <Card className="border-0 shadow-none md:border md:shadow overflow-hidden">
      {/* Session Image */}
      {session.image_url && (
        <div className="relative w-full h-48 md:h-64">
          <Image
            src={session.image_url}
            alt={session.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      )}
      <CardContent className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            {startTime && (
              <h2 className="text-2xl font-bold">
                {format(startTime, "hh:mm")} • {format(startTime, "EEEE d MMM")}
              </h2>
            )}
            <p className="text-muted-foreground text-lg">{session.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Duration</h3>
              <p>{session.duration_minutes} minutes</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Availability</h3>
              <p>
                {spotsRemaining} of {session.capacity} spots
              </p>
            </div>
          </div>

          <div className="prose prose-sm">
            <p>{session.description}</p>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}
