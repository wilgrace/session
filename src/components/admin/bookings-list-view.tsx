"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Loader2, ArrowUp, ArrowDown, X } from "lucide-react"
import { getAdminBookingsForOrg, type AdminBooking } from "@/app/actions/session"
import { cn } from "@/lib/utils"

type SortDirection = "asc" | "desc" | null
type SortColumn = "name" | "type" | "qty" | "date" | "session" | "booking" | "paid" | null

interface BookingsListViewProps {
  searchQuery: string
  onSelectBooking: (booking: any) => void
  onClearSearch?: () => void
}

export function BookingsListView({ searchQuery, onSelectBooking, onClearSearch }: BookingsListViewProps) {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortColumn, setSortColumn] = useState<SortColumn>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past'>('upcoming')
  const pageSize = 25

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAdminBookingsForOrg({
        search: searchQuery || undefined,
        page,
        pageSize,
        timeFilter,
      })
      console.log('[BookingsListView] Fetch result:', result)
      if (result.success && result.data) {
        setBookings(result.data)
        setTotal(result.total ?? result.data.length)
      } else {
        console.error('[BookingsListView] Fetch failed:', result.error)
      }
    } catch (error) {
      console.error("[BookingsListView] Failed to fetch bookings:", error)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, page, timeFilter])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  // Reset to page 1 when search or time filter changes
  useEffect(() => {
    setPage(1)
  }, [searchQuery, timeFilter])

  const getUserName = (user: AdminBooking["user"]) => {
    if (user?.first_name || user?.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim()
    }
    return user?.email || "Unknown"
  }

  const getUserType = (booking: AdminBooking) => {
    const role = booking.user?.role?.toLowerCase() || "user"
    if (role === "admin" || role === "superadmin") return "admin"
    if (role === "guest") return "guest"
    if (booking.is_member) return "member"
    return "user"
  }

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case "admin":
        return "bg-blue-100 text-blue-800"
      case "member":
        return "bg-purple-100 text-purple-700"
      case "guest":
        return "bg-gray-100 text-gray-600"
      default:
        return "bg-gray-100 text-gray-600"
    }
  }

  const formatPrice = (amount: number | null) => {
    if (amount === null || amount === undefined) return "—"
    return `£${(amount / 100).toFixed(2)}`
  }

  const formatSessionDate = (startTime: string) => {
    return format(new Date(startTime), "EEE d MMM")
  }

  const formatSessionTime = (startTime: string, templateName: string) => {
    const time = format(new Date(startTime), "HH:mm")
    return `${time} - ${templateName}`
  }

  const formatBookingDate = (bookedAt: string) => {
    return format(new Date(bookedAt), "d MMM, HH:mm")
  }

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> off
      if (sortDirection === "asc") {
        setSortDirection("desc")
      } else if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  // Sort bookings based on current sort state
  const sortedBookings = useMemo(() => {
    if (!sortColumn || !sortDirection) return bookings

    return [...bookings].sort((a, b) => {
      let aVal: any
      let bVal: any

      switch (sortColumn) {
        case "name":
          aVal = getUserName(a.user).toLowerCase()
          bVal = getUserName(b.user).toLowerCase()
          break
        case "type":
          aVal = getUserType(a)
          bVal = getUserType(b)
          break
        case "qty":
          aVal = a.number_of_spots
          bVal = b.number_of_spots
          break
        case "date":
          aVal = a.session_instance?.start_time ? new Date(a.session_instance.start_time).getTime() : 0
          bVal = b.session_instance?.start_time ? new Date(b.session_instance.start_time).getTime() : 0
          break
        case "session":
          aVal = a.session_instance?.template?.name?.toLowerCase() || ""
          bVal = b.session_instance?.template?.name?.toLowerCase() || ""
          break
        case "booking":
          aVal = new Date(a.booked_at).getTime()
          bVal = new Date(b.booked_at).getTime()
          break
        case "paid":
          aVal = a.amount_paid ?? 0
          bVal = b.amount_paid ?? 0
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
      return 0
    })
  }, [bookings, sortColumn, sortDirection])

  const totalPages = Math.ceil(total / pageSize)
  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)

  const handleRowClick = (booking: AdminBooking, e: React.MouseEvent) => {
    // Don't trigger if clicking on a button
    if ((e.target as HTMLElement).closest("button")) {
      return
    }
    // Transform to the format expected by BookingDetailsPanel
    onSelectBooking({
      id: booking.id,
      number_of_spots: booking.number_of_spots,
      status: booking.status,
      amount_paid: booking.amount_paid,
      booked_at: booking.booked_at,
      user: booking.user,
      session_instance: booking.session_instance,
    })
  }

  // Sortable column header component
  const SortableHeader = ({ column, children, className }: { column: SortColumn; children: React.ReactNode; className?: string }) => {
    const isActive = sortColumn === column
    return (
      <TableHead
        className={`cursor-pointer select-none hover:bg-muted/50 group ${className || ""}`}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive && sortDirection === "asc" && <ArrowUp className="h-3 w-3" />}
          {isActive && sortDirection === "desc" && <ArrowDown className="h-3 w-3" />}
          {!isActive && <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />}
        </div>
      </TableHead>
    )
  }

  if (loading && bookings.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {searchQuery && (
        <div className="px-6 py-3 bg-muted/50 border-b flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing results for &ldquo;{searchQuery}&rdquo;
          </p>
          {onClearSearch && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSearch}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      <div className="flex border-b">
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
            timeFilter === 'upcoming'
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => { setTimeFilter('upcoming'); setPage(1); }}
        >
          Upcoming
        </button>
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
            timeFilter === 'past'
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => { setTimeFilter('past'); setPage(1); }}
        >
          Past
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader column="name">Name</SortableHeader>
              <SortableHeader column="type">Type</SortableHeader>
              <SortableHeader column="qty" className="text-center">Qty</SortableHeader>
              <SortableHeader column="date">Date</SortableHeader>
              <SortableHeader column="session">Session</SortableHeader>
              <SortableHeader column="booking">Booking</SortableHeader>
              <SortableHeader column="paid" className="text-right">Paid</SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {searchQuery
                    ? "No bookings found matching your search"
                    : timeFilter === 'upcoming'
                    ? "No upcoming bookings"
                    : "No past bookings"}
                </TableCell>
              </TableRow>
            ) : (
              sortedBookings.map((booking) => {
                const userType = getUserType(booking)
                return (
                  <TableRow
                    key={booking.id}
                    className="cursor-pointer"
                    onClick={(e) => handleRowClick(booking, e)}
                  >
                    <TableCell className="font-medium">
                      {getUserName(booking.user)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={getTypeBadgeClass(userType)}
                      >
                        {userType.charAt(0).toUpperCase() + userType.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {booking.number_of_spots}
                    </TableCell>
                    <TableCell>
                      {booking.session_instance?.start_time
                        ? formatSessionDate(booking.session_instance.start_time)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {booking.session_instance?.start_time && booking.session_instance?.template?.name
                        ? formatSessionTime(
                            booking.session_instance.start_time,
                            booking.session_instance.template.name
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBookingDate(booking.booked_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(booking.amount_paid)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between px-6 py-4 border-t bg-white">
          <p className="text-sm text-muted-foreground">
            Showing {startItem}-{endItem} of {total} bookings
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
