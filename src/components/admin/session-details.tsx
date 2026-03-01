import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getEventColorValues } from '@/lib/event-colors';

interface Session {
  id: string;
  start_time: string;
  end_time?: string;
  status?: string;
  bookings?: { number_of_spots?: number }[];
  template?: { name?: string; capacity?: number; event_color?: string | null };
}

interface SessionDetailsProps {
  session: Session;
  currentIndex?: number;
  totalSessions?: number;
  onPrevSession?: () => void;
  onNextSession?: () => void;
  onManage?: () => void;
}

export function SessionDetails({
  session,
  currentIndex = 0,
  totalSessions = 1,
  onPrevSession,
  onNextSession,
  onManage,
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
  const isCancelled = session.status === 'cancelled';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl flex items-center gap-2">
            <span className="font-bold">{time}</span>
            <span className="text-muted-foreground">{spotsTaken}/{capacity}</span>
            {isCancelled && <Badge variant="destructive" className="text-xs">Cancelled</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: eventColor.color500 }}
            />
            {session.template?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={onManage}
              className="text-xs"
            >
              Manage Session
            </Button>
          )}
          {showNavigation && (
            <div className="flex items-center gap-2 justify-center">
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
    </div>
  );
} 