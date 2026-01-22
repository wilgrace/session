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
    <div className={cn("mb-6 rounded-lg border overflow-hidden md:mb-0 mx-4 md:mx-0 mt-4 md:mt-0", className)}>
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
        <h2 className="text-base font-medium">Upcoming Bookings</h2>
        <FAQDialog />
      </div>

      <div className="divide-y">
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
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  Edit
                </Link>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}

function FAQDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-sm">
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          First time visiting?
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Frequently Asked Questions</DialogTitle>
          <DialogDescription>Everything you need to know about your booking experience.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <h3 className="font-medium text-gray-900">How do I book a session?</h3>
            <p className="mt-1 text-sm text-gray-500">
              Browse the calendar below, select your desired session, and click "Book Now". Follow the prompts to
              complete your booking.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Can I modify my booking?</h3>
            <p className="mt-1 text-sm text-gray-500">
              Yes, you can edit or cancel your booking up to 24 hours before the scheduled session time. Click the
              "Edit" button next to your booking to make changes.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">What's your cancellation policy?</h3>
            <p className="mt-1 text-sm text-gray-500">
              Cancellations made at least 24 hours before the session start time will receive a full refund.
              Cancellations made less than 24 hours in advance are non-refundable.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">How many spots can I book?</h3>
            <p className="mt-1 text-sm text-gray-500">
              You can book multiple spots for a single session if you're bringing friends or family. The maximum number
              of spots you can book depends on the session's availability.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <DialogClose asChild>
            <Button>Got it, thanks!</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
} 