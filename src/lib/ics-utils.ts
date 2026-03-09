export interface ICSEvent {
  title: string
  startTime: Date
  endTime: Date
  location?: string
  description?: string
  uid?: string
}

export function generateICS(event: ICSEvent): string {
  const formatICSDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bookasession//Booking//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatICSDate(event.startTime)}`,
    `DTEND:${formatICSDate(event.endTime)}`,
    `SUMMARY:${event.title}`,
    event.location ? `LOCATION:${event.location}` : '',
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '',
    `UID:${event.uid ?? `${Date.now()}@bookasession.org`}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}
