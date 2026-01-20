import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Check, Pencil, X } from 'lucide-react';
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
    is_super_admin?: boolean;
    image_url?: string;
    avatar_url?: string;
    visits?: number;
    survey_complete?: boolean;
    joined_year?: number;
  };
}

export function BookingDetailsPanel({ booking, onClose, onEdit, onCheckIn }: {
  booking: Booking;
  onClose: () => void;
  onEdit: () => void;
  onCheckIn: (bookingId: string, newStatus: 'confirmed' | 'completed') => void;
}) {
  const { toast } = useToast();
  const [localBooking, setLocalBooking] = useState<Booking>(booking);

  // Sync local state when booking prop changes (e.g., from list check-in)
  useEffect(() => {
    setLocalBooking(booking);
  }, [booking]);

  const handleCheckIn = async () => {
    try {
      const result = await checkInBooking(localBooking.id);
      if (result.success) {
        // Update local state
        setLocalBooking(prev => ({
          ...prev,
          status: result.data.status
        }));
        onCheckIn(localBooking.id, result.data.status); // Notify parent
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

  if (!localBooking) return null;
  const user = localBooking.user || {};
  return (
    <div className="w-full mx-auto bg-background h-full flex flex-col">
      <div className="flex items-center justify-between p-4">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back">
          <X className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          {localBooking.status === 'completed' ? (
            <Button 
              variant="default" 
              size="sm" 
              className="bg-green-500 hover:bg-green-600"
              onClick={handleCheckIn}
            >
              <Check className="h-4 w-4 mr-1" /> Checked In
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCheckIn}
            >
              <Check className="h-4 w-4 mr-1" /> Check in
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center p-6">
        <Avatar className="h-16 w-16 mb-2">
          <AvatarImage src={user.image_url || user.avatar_url || undefined} />
          <AvatarFallback>
            {(user.first_name?.[0] || user.full_name?.[0] || user.name?.[0] || '?')}
          </AvatarFallback>
        </Avatar>
        <div className="text-xl font-bold">
          {user.first_name && user.last_name 
            ? `${user.first_name} ${user.last_name}`
            : user.full_name || user.name || 'Guest'}
        </div>
        <div className="text-muted-foreground mb-2">{user.email}</div>
        <Badge variant={user.is_super_admin ? 'default' : 'secondary'}>
          {user.is_super_admin ? 'Admin' : localBooking.user ? 'User' : 'Guest'}
        </Badge>
      </div>
      <Card className="p-4 mx-4 mb-4">
        <div className="font-semibold mb-2">Booking Details</div>
        <div className="text-sm mb-1">Group size: {localBooking.number_of_spots || 1}</div>
        <div className="text-sm mb-1">
          Status: <Badge variant={localBooking.status === 'completed' ? 'default' : 'outline'}>{localBooking.status}</Badge>
        </div>
        {localBooking.notes && <div className="text-sm mb-1">Notes: {localBooking.notes}</div>}
        {localBooking.created_at && <div className="text-xs text-muted-foreground">Booked: {new Date(localBooking.created_at).toLocaleString()}</div>}
      </Card>
      <Card className="p-4 mx-4">
        <div className="font-semibold mb-2">About {user.full_name?.split(' ')[0] || user.name?.split(' ')[0] || 'Guest'}</div>
        {user.visits && <div className="flex items-center gap-2 text-sm mb-1"><Check className="h-4 w-4 text-muted-foreground" /> {user.visits} visits</div>}
        {user.survey_complete && <div className="flex items-center gap-2 text-sm mb-1"><Check className="h-4 w-4 text-muted-foreground" /> Survey complete</div>}
        {user.joined_year && <div className="flex items-center gap-2 text-sm mb-1"><Check className="h-4 w-4 text-muted-foreground" /> Joined in {user.joined_year}</div>}
      </Card>
    </div>
  );
} 