"use client"
import Link from "next/link"
import { format } from "date-fns"
import { Calendar, Users, Edit, HelpCircle, ChevronRight, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Booking } from "@/types/booking"

interface UpcomingBookingsProps {
  bookings: Booking[]
  className?: string
  slug: string
}

export function UpcomingBookings({ bookings, className, slug }: UpcomingBookingsProps) {
  if (!bookings || bookings.length === 0) {
    return null
  }

  return (
    <div className={cn("mb-6 rounded-lg border border-gray-200 overflow-hidden md:mb-0 mx-4 md:mx-0 mt-4 md:mt-0", className)}>
      <div className="bg-white px-6 py-3 flex items-center justify-between border-b border-gray-200">
        <h2 className="text-left text-xs uppercase tracking-wider font-medium text-muted-foreground">
          YOUR UPCOMING BOOKINGS
          </h2>
      </div>

      <div className="divide-y bg-white">
        {bookings.map((booking) => (
          <div key={booking.id} className="p-4 sm:px-6 hover:bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <div className="mb-2 sm:mb-0">
                <h3 className="font-medium text-gray-900">
                  {format(booking.date, "HH:mm 'on' EEEE, do MMMM")}
                </h3>
                <div className="mt-1 flex flex-row items-center text-sm text-gray-500 gap-x-4">
                  <div className="flex items-center">
                    <Calendar className="mr-1 h-4 w-4 flex-shrink-0 text-gray-400" />
                    {booking.sessionName} ({booking.duration})
                  </div>
                  <span className="mx-2 text-gray-300">•</span>
                  <div className="flex items-center">
                    <Users className="mr-1 h-4 w-4 flex-shrink-0 text-gray-400" />
                    {booking.spotsBooked} {booking.spotsBooked === 1 ? "spot" : "spots"} booked
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Link
                  href={`/${slug}/${booking.session_instance.session_templates.id}?edit=true&bookingId=${booking.id}&start=${new Date(booking.session_instance.start_time).toISOString()}`}
                  className="flex items-center px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  Edit
                </Link>
              </div>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}