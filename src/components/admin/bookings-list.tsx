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
    is_super_admin?: boolean;
    clerk_user_id?: string;
    image_url?: string;
    avatar_url?: string;
  };
}

// Helper to get display name from user
function getUserDisplayName(user?: Booking['user']): string {
  if (!user) return 'Guest';
  if (user.first_name) {
    return user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.first_name;
  }
  return user.full_name || user.name || user.email || 'Guest';
}

// Helper to determine user type from clerk_user_id prefix
function getUserType(user?: Booking['user']): 'Admin' | 'User' | 'Guest' {
  if (!user) return 'Guest';
  if (user.is_super_admin) return 'Admin';
  if (user.clerk_user_id?.startsWith('guest_')) return 'Guest';
  if (user.clerk_user_id?.startsWith('user_')) return 'User';
  return 'User'; // Default to User if clerk_user_id doesn't have expected prefix
}

export function BookingsList({ bookings, onSelect, onCheckIn }: {
  bookings: Booking[];
  onSelect: (booking: Booking) => void;
  onCheckIn: (bookingId: string, newStatus: 'confirmed' | 'completed') => void;
}) {
  const { toast } = useToast();
  const [localBookings, setLocalBookings] = useState<Booking[]>(bookings);

  // Debug: log bookings prop

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
        onCheckIn(bookingId, result.data.status); // Notify parent
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
                {getUserDisplayName(booking.user)}
                {booking.number_of_spots > 1 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    + {booking.number_of_spots - 1} guests
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {getUserType(booking.user)}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
} 