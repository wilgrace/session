-- Add pending_payment to the valid_status check constraint for bookings
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE bookings ADD CONSTRAINT valid_status CHECK (status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text]));
