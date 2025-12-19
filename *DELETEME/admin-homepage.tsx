"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Check, GripHorizontal, Home, Calendar, Users } from "lucide-react"
import { format, addDays, startOfDay, isSameDay } from "date-fns"
import { cn } from "@/lib/utils"
import { useMobile } from "@/hooks/use-mobile"
import Link from "next/link"

// Mock data for sessions across multiple days
const generateMockData = () => {
  const today = startOfDay(new Date())
  const days = []

  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i)
    const sessions =
      i === 1
        ? []
        : [
            // Tuesday has no sessions
            { time: "07:00", bookings: Math.floor(Math.random() * 10) + 1, capacity: 10 },
            { time: "08:00", bookings: Math.floor(Math.random() * 8) + 1, capacity: 10 },
            { time: "09:00", bookings: Math.floor(Math.random() * 8) + 1, capacity: 10 },
            { time: "11:00", bookings: Math.floor(Math.random() * 7) + 1, capacity: 10 },
            { time: "13:00", bookings: Math.floor(Math.random() * 5) + 1, capacity: 10 },
            { time: "15:00", bookings: Math.floor(Math.random() * 7) + 1, capacity: 10 },
            { time: "17:00", bookings: Math.floor(Math.random() * 8) + 1, capacity: 10 },
            ...(i > 2
              ? [
                  { time: "10:00", bookings: Math.floor(Math.random() * 7) + 1, capacity: 10 },
                  { time: "12:00", bookings: Math.floor(Math.random() * 5) + 1, capacity: 10 },
                  { time: "19:00", bookings: Math.floor(Math.random() * 10) + 1, capacity: 10 },
                ]
              : []),
          ]

    days.push({
      date,
      sessions: sessions.map((session) => ({
        ...session,
        id: `${format(date, "yyyy-MM-dd")}-${session.time}`,
        bookings: Array.from({ length: session.bookings }, (_, idx) => ({
          id: `booking-${session.time}-${idx}`,
          guestName: ["Raj Mudhar", "John Smith", "Emma Wilson", "Sarah Johnson", "Mike Brown"][idx % 5],
          avatar: "/placeholder.svg?height=40&width=40",
          groupSize: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 2 : 1,
          email: [
            "raj.mudhar@example.com",
            "john@example.com",
            "emma@example.com",
            "sarah@example.com",
            "mike@example.com",
          ][idx % 5],
          userType: ["Member", "Guest", "User"][Math.floor(Math.random() * 3)],
          visits: Math.floor(Math.random() * 20) + 1,
          surveyComplete: Math.random() > 0.3,
          joinedYear: 2015 + Math.floor(Math.random() * 10),
          checkedIn: Math.random() > 0.8,
        })),
      })),
    })
  }

  return days
}

const getSessionColor = (bookings: number, capacity: number) => {
  const ratio = bookings / capacity
  if (ratio <= 0.2) return "bg-white border-2"
  if (ratio <= 0.4) return "bg-blue-50 border-blue-200"
  if (ratio <= 0.6) return "bg-blue-100 border-blue-300"
  if (ratio <= 0.8) return "bg-blue-200 border-blue-400"
  return "bg-blue-300 border-blue-500"
}

export default function AdminHomepage() {
  const [dayOffset, setDayOffset] = useState(0)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [selectedSession, setSelectedSession] = useState<any>(null)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const isMobile = useMobile()

  const mockData = generateMockData()
  const visibleDays = isMobile ? mockData.slice(dayOffset, dayOffset + 4) : mockData.slice(dayOffset, dayOffset + 7)

  // Auto-select first session of today if none selected
  if (!selectedSession && mockData[0]?.sessions.length > 0) {
    const firstSession = mockData[0].sessions[0]
    setSelectedSession({
      ...firstSession,
      date: mockData[0].date,
      sessionType: "Communal Session",
      sessionSubtype: "NHS Free Session",
    })
  }

  const handleCheckIn = (bookingId: string) => {
    console.log("Check in booking:", bookingId)
    // In real app, update the booking status
  }

  const DayColumn = ({ day, isCollapsed }: { day: any; isCollapsed: boolean }) => {
    const totalSessions = day.sessions.length
    const totalBookings = day.sessions.reduce((sum: number, session: any) => sum + session.bookings.length, 0)
    const totalCapacity = day.sessions.reduce((sum: number, session: any) => sum + session.capacity, 0)
    const isToday = isSameDay(day.date, new Date())
    const isSelected = selectedSession && isSameDay(selectedSession.date, day.date)

    const getDayCapacityColor = (bookings: number, capacity: number) => {
      const ratio = bookings / capacity
      if (ratio <= 0.2) return "text-gray-600"
      if (ratio <= 0.4) return "text-blue-600"
      if (ratio <= 0.6) return "text-blue-700"
      if (ratio <= 0.8) return "text-blue-800"
      return "text-blue-900"
    }

    if (isCollapsed) {
      return (
        <div
          className={cn(
            "flex-1 min-w-0 p-3 border-r cursor-pointer hover:bg-muted/50",
            isToday && "bg-blue-50",
            isSelected && "bg-primary/10 border-primary",
          )}
          onClick={() => setIsCollapsed(false)}
        >
          <div className="text-center">
            <div className="font-normal">{format(day.date, "EEE")}</div>
            <div className="text-sm text-muted-foreground font-normal">{format(day.date, "d MMM")}</div>
            {totalSessions === 0 ? (
              <div className="text-xs text-muted-foreground mt-2">No sessions</div>
            ) : (
              <div className={cn("text-xs mt-1", getDayCapacityColor(totalBookings, totalCapacity))}>
                {totalSessions} sessions • {totalBookings}
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className={cn("flex-1 min-w-0 p-3 border-r", isToday && "bg-blue-50")}>
        <div className="text-center mb-3">
          <div className="font-normal cursor-pointer hover:text-primary" onClick={() => setIsCollapsed(true)}>
            {format(day.date, "EEE")}
          </div>
          <div
            className="text-sm text-muted-foreground font-normal cursor-pointer hover:text-primary"
            onClick={() => setIsCollapsed(true)}
          >
            {format(day.date, "d MMM")}
          </div>
          {totalSessions === 0 && <div className="text-xs text-muted-foreground mt-2">No sessions</div>}
        </div>

        <div className="space-y-1">
          {day.sessions.map((session: any) => (
            <div
              key={session.id}
              className={cn(
                "p-2 rounded text-xs cursor-pointer border transition-all hover:shadow-sm flex justify-between items-center",
                getSessionColor(session.bookings.length, session.capacity),
                selectedSession?.id === session.id && "ring-2 ring-primary",
              )}
              onClick={() => {
                setSelectedSession({
                  ...session,
                  date: day.date,
                  sessionType: "Communal Session",
                  sessionSubtype: "NHS Free Session",
                })
                setSelectedBooking(null)
              }}
            >
              <div className="font-bold">{session.time}</div>
              <div className="text-muted-foreground">{session.bookings.length}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const BookingDetailView = ({ booking, onBack }: any) => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive">
            Delete
          </Button>
        </div>
      </div>

      {/* Guest header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={booking.avatar || "/placeholder.svg"} />
          <AvatarFallback>{booking.guestName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{booking.guestName}</h1>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{booking.userType}</Badge>
            <span className="text-sm text-muted-foreground">{booking.email}</span>
          </div>
        </div>
      </div>

      {/* Booking details */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-2">Booking Details</h2>
          <p className="text-sm mb-1">Gorgeous Cartws close to centre</p>
          <p className="text-sm mb-1">6-8 Jun</p>
          <p className="text-sm">{booking.groupSize} guests, 1 pet • £212.08</p>
        </CardContent>
      </Card>

      {/* About guest */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-4">About {booking.guestName.split(" ")[0]}</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{booking.visits} visits</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{booking.surveyComplete ? "Survey complete" : "Survey incomplete"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Joined in {booking.joinedYear}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar Navigation - Desktop only */}
      {!isMobile && (
        <div className="w-64 border-r bg-muted/10 flex-col hidden lg:flex">
          <div className="p-6">
            <h2 className="text-lg font-semibold">Sauna Admin</h2>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary text-primary-foreground">
              <Home className="h-4 w-4" />
              Home
            </Link>
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted">
              <Calendar className="h-4 w-4" />
              Calendar
            </Link>
            <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted">
              <Users className="h-4 w-4" />
              Users
            </Link>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold">Home</h1>
        </div>

        {/* Day/Session Picker */}
        <div className="border-b bg-background">
          <div className="flex items-start">
            <div className="flex items-center justify-between p-4 pt-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDayOffset(Math.max(0, dayOffset - (isMobile ? 4 : 7)))}
                disabled={dayOffset === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {visibleDays.map((day, index) => (
                <DayColumn key={format(day.date, "yyyy-MM-dd")} day={day} isCollapsed={isCollapsed} />
              ))}
            </div>

            <div className="flex items-center justify-between p-4 pt-6">
              <Button variant="ghost" size="icon" onClick={() => setDayOffset(dayOffset + (isMobile ? 4 : 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Collapse/Expand Controls */}
          {!isCollapsed && (
            <div className="flex items-center justify-center p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCollapsed(true)}
                className="flex items-center gap-2"
              >
                <GripHorizontal className="h-4 w-4" />
                Hide
              </Button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 flex">
          {/* Session Details & Bookings */}
          <div className={cn("flex-1", selectedBooking && !isMobile && "border-r")}>
            {selectedSession && (
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl">
                    <span className="font-bold">{selectedSession.time}</span>
                    <span className="font-normal"> • {format(selectedSession.date, "EEEE d MMMM")}</span>
                  </h2>
                  <p className="text-muted-foreground">
                    {selectedSession.sessionType} • {selectedSession.sessionSubtype}
                  </p>
                </div>

                {/* Bookings List */}
                <div className="space-y-2">
                  {selectedSession.bookings
                    .filter((booking: any) => !booking.checkedIn)
                    .map((booking: any) => (
                      <div
                        key={booking.id}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedBooking(booking)}
                      >
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCheckIn(booking.id)
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <div>
                            <p className="font-medium">
                              {booking.guestName}
                              {booking.groupSize > 1 && (
                                <span className="text-sm text-muted-foreground ml-2">
                                  + {booking.groupSize - 1} guests
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">{selectedSession.sessionSubtype}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}

                  {/* Checked In Section */}
                  {selectedSession.bookings.some((booking: any) => booking.checkedIn) && (
                    <div className="mt-6">
                      <h3 className="font-medium mb-2 text-green-600">Checked In</h3>
                      {selectedSession.bookings
                        .filter((booking: any) => booking.checkedIn)
                        .map((booking: any) => (
                          <div
                            key={booking.id}
                            className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 bg-green-50"
                            onClick={() => setSelectedBooking(booking)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                                <Check className="h-4 w-4 text-white" />
                              </div>
                              <div>
                                <p className="font-medium">{booking.guestName}</p>
                                <p className="text-sm text-muted-foreground">Group of {booking.groupSize}</p>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Booking Detail Panel */}
          {selectedBooking && (
            <div className={cn("w-full lg:w-96", isMobile && "absolute inset-0 bg-background z-10")}>
              <div className="p-6 h-full overflow-auto">
                <BookingDetailView booking={selectedBooking} onBack={() => setSelectedBooking(null)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
