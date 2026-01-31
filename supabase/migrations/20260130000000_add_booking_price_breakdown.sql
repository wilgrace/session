-- Add price breakdown columns to bookings table
-- These fields store the pricing details at the time of booking for display on confirmation

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS unit_price integer,
ADD COLUMN IF NOT EXISTS discount_amount integer;

-- Add comments for documentation
COMMENT ON COLUMN bookings.unit_price IS 'First person price in pence at time of booking';
COMMENT ON COLUMN bookings.discount_amount IS 'Discount applied in pence (from coupon)';
