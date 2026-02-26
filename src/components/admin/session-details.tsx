import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getEventColorValues } from '@/lib/event-colors';

interface Session {
  id: string;
  start_time: string;
  end_time?: string;
  bookings?: { number_of_spots?: number }[];
  template?: { name?: string; capacity?: number; event_color?: string | null };
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

  const spotsTaken = (session.bookings || []).reduce(
    (sum, b) => sum + (b.number_of_spots || 1), 0
  );
  const capacity = session.template?.capacity || 0;
  const eventColor = getEventColorValues(session.template?.event_color);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalSessions - 1;
  const showNavigation = totalSessions > 1;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl">
            <span className="font-bold">{time}</span>
            <span className="text-muted-foreground ml-2">{spotsTaken}/{capacity}</span>
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: eventColor.color500 }}
            />
            {session.template?.name}
          </p>
        </div>
        {showNavigation && (
          <div className="flex items-center gap-2 justify-center" style={{ minWidth: '120px' }}>
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
    </div>
  );
} 