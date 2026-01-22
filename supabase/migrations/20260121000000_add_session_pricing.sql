-- Add pricing fields to session_templates
ALTER TABLE session_templates
ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'free',
ADD COLUMN drop_in_price INTEGER,
ADD COLUMN booking_instructions TEXT;

-- Add check constraint for pricing_type
ALTER TABLE session_templates
ADD CONSTRAINT session_templates_pricing_type_check
CHECK (pricing_type IN ('free', 'paid'));

-- Add payment tracking fields to bookings
ALTER TABLE bookings
ADD COLUMN payment_status TEXT DEFAULT 'not_required',
ADD COLUMN stripe_checkout_session_id TEXT,
ADD COLUMN stripe_payment_intent_id TEXT,
ADD COLUMN amount_paid INTEGER;

-- Add check constraint for payment_status
ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_status_check
CHECK (payment_status IN ('not_required', 'pending', 'completed', 'failed', 'refunded'));

-- Add indexes for payment lookups
CREATE INDEX idx_bookings_checkout_session ON bookings(stripe_checkout_session_id)
WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX idx_bookings_payment_intent ON bookings(stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);

-- Add index for finding pending_payment bookings (for cleanup)
CREATE INDEX idx_bookings_pending_payment ON bookings(status, booked_at)
WHERE status = 'pending_payment';
