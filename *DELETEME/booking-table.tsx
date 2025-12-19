"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2 } from "lucide-react"

interface Booking {
  id: number
  guestName: string
  avatar: string
  groupSize: number
  bookingDate: string
  checkIn: string
  amount: string
  status: string
}

interface BookingTableProps {
  bookings: Booking[]
  onEdit: (bookingId: number) => void
  onDelete: (bookingId: number) => void
}

export default function BookingTable({ bookings, onEdit, onDelete }: BookingTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Guest</TableHead>
            <TableHead>Group Size</TableHead>
            <TableHead>Booking Date</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => (
            <TableRow key={booking.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={booking.avatar || "/placeholder.svg"} />
                    <AvatarFallback>{booking.guestName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{booking.guestName}</span>
                </div>
              </TableCell>
              <TableCell>{booking.groupSize}</TableCell>
              <TableCell>{booking.bookingDate}</TableCell>
              <TableCell>{booking.checkIn}</TableCell>
              <TableCell>{booking.amount}</TableCell>
              <TableCell>
                <Badge variant={booking.status === "checking-out" ? "destructive" : "default"}>{booking.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(booking.id)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(booking.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
