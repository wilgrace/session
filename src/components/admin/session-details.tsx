import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Session {
  id: string;
  name: string;
  start_time: string;
  bookings?: any[];
}

interface SessionDetailsProps {
  session: Session;
  currentIndex?: number;
  totalSessions?: number;
  onPrevSession?: () => void;
  onNextSession?: () => void;
}

export function SessionDetails({
  session,
  currentIndex = 0,
  totalSessions = 1,
  onPrevSession,
  onNextSession,
}: SessionDetailsProps) {
  const date = new Date(session.start_time);
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dayMonth = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalSessions - 1;
  const showNavigation = totalSessions > 1;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl">
          <span className="font-bold">{time}</span> • {dayName} {dayMonth}
        </h2>
        {showNavigation && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onPrevSession}
              disabled={!hasPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {totalSessions}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onNextSession}
              disabled={!hasNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
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