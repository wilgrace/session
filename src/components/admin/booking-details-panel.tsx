import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, X, ChevronLeft, Loader2, CalendarDays } from 'lucide-react';
import { checkInBooking, cancelBookingWithRefund, getAdminMoveOptions, moveBookingToInstance } from '@/app/actions/session';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';

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

type MoveOption = {
  id: string;
  start_time: string;
  end_time: string;
  template_name: string;
  available_spots: number;
};

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

type MoveBookingBodyProps = {
  moveOptionsLoading: boolean;
  moveOptions: MoveOption[];
  selectedMoveOption: MoveOption | null;
  setSelectedMoveOption: (o: MoveOption | null) => void;
  moving: boolean;
  handleConfirmMove: () => void;
};

function MoveBookingBody({
  moveOptionsLoading,
  moveOptions,
  selectedMoveOption,
  setSelectedMoveOption,
  moving,
  handleConfirmMove,
}: MoveBookingBodyProps) {
  return (
    <div className="flex-1 overflow-auto py-2">
      {moveOptionsLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!moveOptionsLoading && !selectedMoveOption && (
        <>
          {moveOptions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No other sessions available in the next 60 days.
            </p>
          ) : (
            <div className="space-y-2">
              {moveOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedMoveOption(option)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border hover:bg-accent transition-colors text-left"
                >
                  <div>
                    <div className="font-medium">{option.template_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(option.start_time), "EEEE, do MMMM")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(option.start_time), "HH:mm")}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground shrink-0">
                    {option.available_spots} spot{option.available_spots !== 1 ? 's' : ''} left
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!moveOptionsLoading && selectedMoveOption && (
        <div className="space-y-4 px-1">
          <p className="text-sm text-muted-foreground">Move this booking to:</p>
          <div className="rounded-lg border p-4 space-y-1">
            <div className="font-semibold">{selectedMoveOption.template_name}</div>
            <div className="text-sm text-muted-foreground">
              {format(new Date(selectedMoveOption.start_time), "EEEE, do MMMM")}
            </div>
            <div className="text-sm text-muted-foreground">
              {format(new Date(selectedMoveOption.start_time), "HH:mm")}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            No payment changes will be made. Admin override — price discrepancies are your responsibility.
          </p>
          <Button className="w-full" onClick={handleConfirmMove} disabled={moving}>
            {moving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              'Confirm Move'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function BookingDetailsPanel({ open, booking, onClose, onCancel, onCheckIn }: {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onCancel: () => void;
  onCheckIn: (bookingId: string, newStatus: 'confirmed' | 'completed') => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [localBooking, setLocalBooking] = useState<Booking | null>(booking);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Move booking state
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveOptionsLoading, setMoveOptionsLoading] = useState(false);
  const [moveOptions, setMoveOptions] = useState<MoveOption[]>([]);
  const [selectedMoveOption, setSelectedMoveOption] = useState<MoveOption | null>(null);
  const [moving, setMoving] = useState(false);

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

  const handleOpenMoveSheet = async () => {
    if (!localBooking) return;
    setMoveOpen(true);
    setSelectedMoveOption(null);
    setMoveOptionsLoading(true);

    // Default range: today to 60 days out
    const fromDate = new Date().toISOString();
    const toDate = addDays(new Date(), 60).toISOString();

    const result = await getAdminMoveOptions(localBooking.id, fromDate, toDate);
    setMoveOptionsLoading(false);

    if (result.success && result.data) {
      setMoveOptions(result.data);
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to load available sessions',
        variant: 'destructive',
      });
      setMoveOpen(false);
    }
  };

  const handleConfirmMove = async () => {
    if (!localBooking || !selectedMoveOption) return;
    setMoving(true);
    const result = await moveBookingToInstance(localBooking.id, selectedMoveOption.id, true);
    if (result.success) {
      toast({
        title: 'Booking moved',
        description: `Moved to ${selectedMoveOption.template_name} on ${format(new Date(selectedMoveOption.start_time), 'd MMM')}`,
      });
      setMoveOpen(false);
      onCancel(); // close the panel and refresh parent
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to move booking',
        variant: 'destructive',
      });
      setMoving(false);
    }
  };

  const isCheckedIn = localBooking?.status === 'completed';
  const user = localBooking?.user || {};
  const userType = getUserType(localBooking?.user);
  const sessionName = localBooking?.session_instance?.template?.name;
  const sessionStartTime = localBooking?.session_instance?.start_time;
  const isFuture = sessionStartTime ? new Date(sessionStartTime) > new Date() : false;

  return (
    <>
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

                {/* Move Booking — future sessions only */}
                {isFuture && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleOpenMoveSheet}
                    disabled={cancelLoading}
                  >
                    <CalendarDays className="h-4 w-4" />
                    Move Booking
                  </Button>
                )}

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

      {/* Move Booking — bottom sheet on mobile, dialog on desktop */}
      {isMobile ? (
        <Sheet open={moveOpen} onOpenChange={(open) => {
          if (!moving) setMoveOpen(open);
        }}>
          <SheetContent side="bottom" className="max-h-[80vh] flex flex-col rounded-t-xl">
            <SheetHeader className="pb-2">
              <div className="flex items-center gap-2">
                {selectedMoveOption && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedMoveOption(null)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <SheetTitle>{selectedMoveOption ? 'Confirm Move' : 'Move to Session'}</SheetTitle>
              </div>
            </SheetHeader>
            <MoveBookingBody
              moveOptionsLoading={moveOptionsLoading}
              moveOptions={moveOptions}
              selectedMoveOption={selectedMoveOption}
              setSelectedMoveOption={setSelectedMoveOption}
              moving={moving}
              handleConfirmMove={handleConfirmMove}
            />
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={moveOpen} onOpenChange={(open) => {
          if (!moving) setMoveOpen(open);
        }}>
          <DialogContent className="sm:max-w-md flex flex-col max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <div className="flex items-center gap-2">
                {selectedMoveOption && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedMoveOption(null)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <DialogTitle>{selectedMoveOption ? 'Confirm Move' : 'Move to Session'}</DialogTitle>
              </div>
            </DialogHeader>
            <MoveBookingBody
              moveOptionsLoading={moveOptionsLoading}
              moveOptions={moveOptions}
              selectedMoveOption={selectedMoveOption}
              setSelectedMoveOption={setSelectedMoveOption}
              moving={moving}
              handleConfirmMove={handleConfirmMove}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
