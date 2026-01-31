"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, CalendarPlus, Check } from "lucide-react"
import { format } from "date-fns"

interface ShareActionsProps {
  sessionName: string
  startTime: Date
  endTime?: Date
  duration?: number // in minutes
  location?: string
  description?: string
  bookingUrl?: string
}

export function ShareActions({
  sessionName,
  startTime,
  endTime,
  duration = 60,
  location,
  description,
  bookingUrl,
}: ShareActionsProps) {
  const [copied, setCopied] = useState(false)

  // Calculate end time if not provided
  const calculatedEndTime = endTime || new Date(startTime.getTime() + duration * 60 * 1000)

  // Generate ICS file content
  const generateICS = () => {
    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sawna//Booking//EN',
      'BEGIN:VEVENT',
      `DTSTART:${formatICSDate(startTime)}`,
      `DTEND:${formatICSDate(calculatedEndTime)}`,
      `SUMMARY:${sessionName}`,
      location ? `LOCATION:${location}` : '',
      description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
      `UID:${Date.now()}@sawna.app`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    return icsContent
  }

  // Handle copy link
  const handleCopyLink = async () => {
    const url = bookingUrl || (typeof window !== 'undefined' ? window.location.href : '')

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Handle add to calendar
  const handleAddToCalendar = () => {
    const icsContent = generateICS()
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${sessionName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1 gap-2"
        onClick={handleCopyLink}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copy Link & Share
          </>
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 gap-2"
        onClick={handleAddToCalendar}
      >
        <CalendarPlus className="h-4 w-4" />
        Add to Calendar
      </Button>
    </div>
  )
}
