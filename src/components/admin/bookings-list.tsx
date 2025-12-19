import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Check, ChevronRight } from 'lucide-react';
import { checkInBooking } from '@/app/actions/session';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect } from 'react';

interface Booking {
  id: string;
  status: 'confirmed' | 'completed';
  number_of_spots: number;
  user?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    email?: string;
    role?: string;
    image_url?: string;
    avatar_url?: string;
  };
}

export function BookingsList({ bookings, onSelect, onCheckIn }: {
  bookings: Booking[];
  onSelect: (booking: Booking) => void;
  onCheckIn: () => void;
}) {
  const { toast } = useToast();
  const [localBookings, setLocalBookings] = useState<Booking[]>(bookings);

  // Debug: log bookings prop
  console.log('BookingsList bookings:', bookings);

  // Update local state when props change
  useEffect(() => {
    setLocalBookings(bookings);
  }, [bookings]);

  const handleCheckIn = async (bookingId: string) => {
    try {
      const result = await checkInBooking(bookingId);
      if (result.success) {
        // Update local state
        setLocalBookings(prevBookings => 
          prevBookings.map(booking => 
            booking.id === bookingId 
              ? { ...booking, status: result.data.status }
              : booking
          )
        );
        onCheckIn(); // Notify parent
        toast({
          title: "Success",
          description: result.data.status === 'completed' 
            ? "Booking checked in successfully" 
            : "Booking check-in reversed",
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update booking status",
        variant: "destructive",
      });
    }
  };

  if (!localBookings.length) {
    return <div className="text-muted-foreground text-center py-8">No bookings</div>;
  }

  return (
    <div className="space-y-2">
      {localBookings.map((booking) => (
        <div
          key={booking.id}
          className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
          onClick={() => onSelect(booking)}
        >
          <div className="flex items-center gap-3">
            {booking.status === 'completed' ? (
              <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-4 w-4 text-white" />
              </div>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCheckIn(booking.id);
                }}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <div>
              <p className="font-medium">
                {booking.user?.first_name && booking.user?.last_name 
                  ? `${booking.user.first_name} ${booking.user.last_name}`
                  : booking.user?.full_name || booking.user?.name || 'Guest'}
                {booking.number_of_spots > 1 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    + {booking.number_of_spots - 1} guests
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {booking.user?.role === 'member' ? 'Member' : 'Guest'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
} 