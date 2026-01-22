"use client"

import { format } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SessionTemplate } from "@/types/session"
import { formatPrice } from "./price-display"

interface SessionDetailsProps {
  session: SessionTemplate
  startTime?: Date
  currentUserSpots?: number
  numberOfSpots?: number
  onSpotsChange?: (spots: number) => void
  showSpotsSelector?: boolean
}

export function SessionDetails({
  session,
  startTime,
  currentUserSpots = 0,
  numberOfSpots = 1,
  onSpotsChange,
  showSpotsSelector = false,
}: SessionDetailsProps) {
  // Calculate total spots booked, including current user's spots
  const totalSpotsBooked = (session.instances?.reduce((total, instance) => {
    return total + (instance.bookings?.reduce((sum, booking) => sum + (booking.number_of_spots || 1), 0) || 0)
  }, 0) || 0) + currentUserSpots

  // Calculate spots remaining
  const spotsRemaining = session.capacity - totalSpotsBooked

  const isPaidSession = session.pricing_type === 'paid' && session.drop_in_price

  return (
    <Card className="border-0 shadow-none md:border md:shadow">
      <CardContent className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            {startTime && (
              <h2 className="text-2xl font-bold">
                {format(startTime, "h:mma")} • {format(startTime, "EEEE d MMMM")}
              </h2>
            )}
            <p className="text-muted-foreground text-lg">
              {session.name}
            </p>
          </div>

          <div className="prose prose-sm">
            <p>{session.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Duration</h3>
              <p>{session.duration_minutes} minutes</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Availability</h3>
              <p>{spotsRemaining} of {session.capacity} spots</p>
            </div>
          </div>

          {/* Price display for paid sessions */}
          {isPaidSession && (
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Price</h3>
              <p className="text-2xl font-bold text-primary">
                {formatPrice(session.drop_in_price!)}
                <span className="text-sm font-normal text-muted-foreground ml-1">per person</span>
              </p>
            </div>
          )}

          {/* Spots selector for paid sessions */}
          {showSpotsSelector && onSpotsChange && (
            <div className="pt-4 border-t">
              <Label className="text-sm font-medium text-muted-foreground">Number of Spots</Label>
              <div className="flex items-center space-x-3 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onSpotsChange(Math.max(1, numberOfSpots - 1))}
                  disabled={numberOfSpots <= 1}
                >
                  -
                </Button>
                <div className="w-12 text-center font-medium text-lg">{numberOfSpots}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onSpotsChange(Math.min(spotsRemaining, numberOfSpots + 1))}
                  disabled={numberOfSpots >= spotsRemaining}
                >
                  +
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 