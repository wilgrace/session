"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionTemplate } from "@/types/session"
import type { PriceOption, Membership } from "@/lib/db/schema"

// Lazy load the heavy calendar component (includes moment.js ~70KB and react-big-calendar ~80KB)
const BookingCalendar = dynamic(
  () => import("./booking-calendar").then(mod => ({ default: mod.BookingCalendar })),
  {
    loading: () => <Skeleton className="h-[600px] w-full" />,
    ssr: false
  }
)

export interface LazyBookingCalendarProps {
  sessions: SessionTemplate[]
  slug: string
  isAdmin?: boolean
  bookedInstances?: Record<string, string>
  initialDate?: string
  filterablePriceOptions?: PriceOption[]
  filterableMemberships?: Membership[]
}

export function LazyBookingCalendar({ sessions, slug, isAdmin = false, bookedInstances = {}, initialDate, filterablePriceOptions = [], filterableMemberships = [] }: LazyBookingCalendarProps) {
  return <BookingCalendar sessions={sessions} slug={slug} isAdmin={isAdmin} bookedInstances={bookedInstances} initialDate={initialDate} filterablePriceOptions={filterablePriceOptions} filterableMemberships={filterableMemberships} />
}
