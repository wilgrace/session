import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Check, Pencil } from 'lucide-react';
import { checkInBooking } from '@/app/actions/session';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect } from 'react';

interface Booking {
  id: string;
  status: 'confirmed' | 'completed';
  number_of_spots: number;
  notes?: string;
  created_at?: string;
  user?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    email?: string;
    role?: 'guest' | 'user' | 'admin' | 'superadmin';
    clerk_user_id?: string;
    image_url?: string;
    avatar_url?: string;
    visits?: number;
    survey_complete?: boolean;
    joined_year?: number;
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

// Helper to determine user type from role
function getUserType(user?: Booking['user']): 'Admin' | 'User' | 'Guest' {
  if (!user) return 'Guest';
  if (user.role === 'superadmin' || user.role === 'admin') return 'Admin';
  if (user.role === 'guest') return 'Guest';
  if (user.clerk_user_id?.startsWith('guest_')) return 'Guest';
  return 'User';
}

export function BookingDetailsPanel({ open, booking, onClose, onEdit, onCheckIn }: {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onEdit: () => void;
  onCheckIn: (bookingId: string, newStatus: 'confirmed' | 'completed') => void;
}) {
  const { toast } = useToast();
  const [localBooking, setLocalBooking] = useState<Booking | null>(booking);

  // Sync local state when booking prop changes
  useEffect(() => {
    setLocalBooking(booking);
  }, [booking]);

  const handleCheckIn = async () => {
    if (!localBooking) return;
    try {
      const result = await checkInBooking(localBooking.id);
      if (result.success) {
        setLocalBooking(prev => prev ? { ...prev, status: result.data.status } : null);
        onCheckIn(localBooking.id, result.data.status);
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

  const isCheckedIn = localBooking?.status === 'completed';
  const user = localBooking?.user || {};

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[400px] overflow-y-auto p-0">
        {/* Sticky header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b">
          <SheetHeader>
            <SheetTitle className="text-xl pr-6">
              {localBooking ? getUserDisplayName(localBooking.user) : 'Booking'}
            </SheetTitle>
            <SheetDescription>
              {user.email || 'Booking details'}
            </SheetDescription>
          </SheetHeader>
        </div>

        {localBooking && (
          <>
            {/* Scrollable content */}
            <div className="px-6 py-4 space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center py-4">
                <Avatar className="h-16 w-16 mb-3">
                  <AvatarImage src={user.image_url || user.avatar_url || undefined} />
                  <AvatarFallback>
                    {(user.first_name?.[0] || user.full_name?.[0] || user.name?.[0] || '?')}
                  </AvatarFallback>
                </Avatar>
                <Badge variant={getUserType(localBooking.user) === 'Admin' ? 'default' : 'secondary'}>
                  {getUserType(localBooking.user)}
                </Badge>
              </div>

              {/* Booking Details */}
              <Card className="p-4">
                <div className="font-semibold mb-2">Booking Details</div>
                <div className="text-sm mb-1">Group size: {localBooking.number_of_spots || 1}</div>
                <div className="text-sm mb-1">
                  Status: <Badge variant={isCheckedIn ? 'default' : 'outline'}>{localBooking.status}</Badge>
                </div>
                {localBooking.notes && <div className="text-sm mb-1">Notes: {localBooking.notes}</div>}
                {localBooking.created_at && (
                  <div className="text-xs text-muted-foreground">
                    Booked: {new Date(localBooking.created_at).toLocaleString()}
                  </div>
                )}
              </Card>

              {/* About User */}
              <Card className="p-4">
                <div className="font-semibold mb-2">
                  About {user.first_name || user.full_name?.split(' ')[0] || user.name?.split(' ')[0] || 'Guest'}
                </div>
                {user.visits && (
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Check className="h-4 w-4 text-muted-foreground" /> {user.visits} visits
                  </div>
                )}
                {user.survey_complete && (
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Check className="h-4 w-4 text-muted-foreground" /> Survey complete
                  </div>
                )}
                {user.joined_year && (
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Check className="h-4 w-4 text-muted-foreground" /> Joined in {user.joined_year}
                  </div>
                )}
              </Card>
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 -mx-6 -mb-4">
              <div className="flex gap-2 justify-end w-full">
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button
                  variant={isCheckedIn ? 'default' : 'outline'}
                  size="sm"
                  className={isCheckedIn ? 'bg-green-500 hover:bg-green-600' : ''}
                  onClick={handleCheckIn}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {isCheckedIn ? 'Checked In' : 'Check In'}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
