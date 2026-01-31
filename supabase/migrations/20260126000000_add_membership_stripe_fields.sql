-- Add membership product/price IDs to stripe_connect_accounts
-- These store the Stripe IDs for the membership subscription product
-- created on each Connected Account

ALTER TABLE public.stripe_connect_accounts
  ADD COLUMN IF NOT EXISTS membership_product_id TEXT,
  ADD COLUMN IF NOT EXISTS membership_price_id TEXT,
  ADD COLUMN IF NOT EXISTS membership_monthly_price INTEGER; -- in pence

-- Add cancelled_at to track when cancellation was requested
-- This allows us to show "cancelled but active until X" status
ALTER TABLE public.user_memberships
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add unique constraint on user_id + organization_id
-- A user can only have one membership per organization
ALTER TABLE public.user_memberships
  ADD CONSTRAINT user_memberships_user_org_unique
  UNIQUE (user_id, organization_id);

-- Add index for membership lookups by subscription ID
-- This is used by webhooks to find the membership record
CREATE INDEX IF NOT EXISTS idx_user_memberships_subscription
  ON public.user_memberships(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Add index for membership lookups by customer ID
CREATE INDEX IF NOT EXISTS idx_user_memberships_customer
  ON public.user_memberships(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.stripe_connect_accounts.membership_product_id IS 'Stripe Product ID for monthly membership on the Connected Account';
COMMENT ON COLUMN public.stripe_connect_accounts.membership_price_id IS 'Stripe recurring Price ID for monthly membership on the Connected Account';
COMMENT ON COLUMN public.stripe_connect_accounts.membership_monthly_price IS 'Monthly membership price in pence (cached from Stripe)';
COMMENT ON COLUMN public.user_memberships.cancelled_at IS 'Timestamp when user requested cancellation (may still be active until period end)';
