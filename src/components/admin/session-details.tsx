interface Session {
  id: string;
  name: string;
  start_time: string;
  bookings?: any[];
}

interface SessionDetailsProps {
  session: Session;
}

export function SessionDetails({ session }: SessionDetailsProps) {
  const date = new Date(session.start_time);
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dayMonth = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });

  return (
    <div className="p-6">
      <h2 className="text-xl mb-4">
        <span className="font-bold">{time}</span> • {dayName} {dayMonth}
      </h2>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p>{session.name}</p>
          <span className="text-muted-foreground">•</span>
          <p className="text-muted-foreground">{session.bookings?.length || 0} bookings</p>
        </div>
      </div>
    </div>
  );
} 