"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionTemplate } from "@/types/session"

// Lazy load the heavy calendar component (includes moment.js ~70KB and react-big-calendar ~80KB)
const BookingCalendar = dynamic(
  () => import("./booking-calendar").then(mod => ({ default: mod.BookingCalendar })),
  {
    loading: () => <Skeleton className="h-[600px] w-full" />,
    ssr: false
  }
)

interface LazyBookingCalendarProps {
  sessions: SessionTemplate[]
  slug: string
}

export function LazyBookingCalendar({ sessions, slug }: LazyBookingCalendarProps) {
  return <BookingCalendar sessions={sessions} slug={slug} />
}
