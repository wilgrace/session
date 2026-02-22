import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, X } from 'lucide-react';
import { checkInBooking, cancelBookingWithRefund } from '@/app/actions/session';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface Booking {
  id: string;
  status: 'confirmed' | 'completed';
  number_of_spots: number;
  notes?: string;
  created_at?: string;
  amount_paid?: number | null;
  session_instance?: {
    start_time?: string;
    end_time?: string;
    template?: { name?: string };
  };
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

function formatPrice(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'Free';
  if (amount === 0) return 'Free';
  return `£${(amount / 100).toFixed(2)}`;
}

export function BookingDetailsPanel({ open, booking, onClose, onCancel, onCheckIn }: {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onCancel: () => void;
  onCheckIn: (bookingId: string, newStatus: 'confirmed' | 'completed') => void;
}) {
  const { toast } = useToast();
  const [localBooking, setLocalBooking] = useState<Booking | null>(booking);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Sync local state when booking prop changes
  useEffect(() => {
    setLocalBooking(booking);
    setCancelLoading(false);
  }, [booking]);

  const handleCheckIn = async () => {
    if (!localBooking) return;
    try {
      const result = await checkInBooking(localBooking.id);
      if (result.success) {
        onCheckIn(localBooking.id, result.data.status);
        toast({
          title: "Success",
          description: result.data.status === 'completed'
            ? "Booking checked in successfully"
            : "Booking check-in reversed",
        });
        onClose();
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

  const handleCancel = async () => {
    if (!localBooking) return;
    setCancelLoading(true);
    try {
      const result = await cancelBookingWithRefund(localBooking.id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel booking');
      }
      const userName = getUserDisplayName(localBooking.user);
      const spotsText = localBooking.number_of_spots === 1 ? '1 person' : `${localBooking.number_of_spots} people`;
      toast({
        title: 'Booking Cancelled!',
        description: (
          <div className="flex items-start gap-2 mt-1">
            <X className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <div className="font-medium">{userName}</div>
              <div>For {spotsText}</div>
              {result.refunded && <div>Refund issued</div>}
            </div>
          </div>
        ),
        duration: 4000,
      });
      setCancelLoading(false);
      onCancel();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel booking',
        variant: 'destructive',
      });
      setCancelLoading(false);
    }
  };

  const isCheckedIn = localBooking?.status === 'completed';
  const user = localBooking?.user || {};
  const userType = getUserType(localBooking?.user);
  const sessionName = localBooking?.session_instance?.template?.name;
  const sessionStartTime = localBooking?.session_instance?.start_time;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[400px] flex flex-col p-0">
        {/* Header */}
        <div className="px-6 py-4 border-b pr-12">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={user.image_url || user.avatar_url || undefined} />
                <AvatarFallback>
                  {user.first_name?.[0] || user.full_name?.[0] || user.name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle className="text-base leading-tight">
                    {localBooking ? getUserDisplayName(localBooking.user) : 'Booking'}
                  </SheetTitle>
                  <Badge variant={userType === 'Admin' ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {userType}
                  </Badge>
                </div>
                <SheetDescription className="truncate">
                  {user.email || 'Booking details'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        {localBooking && (
          <>
            {/* Scrollable content */}
            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              {/* Booking Details */}
              <Card className="p-4">
                <div className="font-semibold mb-2">Booking Details</div>
                {sessionName && (
                  <div className="text-sm mb-1 flex items-baseline justify-between gap-2">
                    <span className="font-medium">{sessionName}</span>
                    {sessionStartTime && (
                      <span className="text-muted-foreground shrink-0">
                        {format(new Date(sessionStartTime), 'HH:mm, d MMM')}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-sm mb-1">Group size: {localBooking.number_of_spots || 1}</div>
                <div className="text-sm mb-1">
                  Status: <Badge variant={isCheckedIn ? 'default' : 'outline'}>{localBooking.status}</Badge>
                </div>
                <div className="text-sm mb-1">
                  Price paid: {formatPrice(localBooking.amount_paid)}
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

              {/* Cancel Booking */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full" disabled={cancelLoading}>
                    {cancelLoading ? 'Cancelling...' : 'Cancel Booking'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. The booking will be cancelled and the user will receive a full refund if a payment was made.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep booking</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel}>Yes, cancel</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Footer — always pinned to bottom */}
            <div className="border-t px-6 py-4">
              <Button
                variant="default"
                size="sm"
                className={`w-full ${isCheckedIn ? 'bg-green-500 hover:bg-green-600' : ''}`}
                onClick={handleCheckIn}
                disabled={cancelLoading}
              >
                <Check className="h-4 w-4 mr-1" />
                {isCheckedIn ? 'Checked In' : 'Check In'}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
