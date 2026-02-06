-- ============================================
-- Migration: Add Multiple Memberships Support
-- ============================================

-- 1. Create memberships table
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,

  -- Subscription pricing
  price INTEGER NOT NULL DEFAULT 0, -- in pence, 0 = free
  billing_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'yearly' | 'one_time'

  -- Member session pricing
  member_price_type TEXT NOT NULL DEFAULT 'discount', -- 'discount' | 'fixed'
  member_discount_percent INTEGER, -- e.g., 20 for 20% off
  member_fixed_price INTEGER, -- fixed price in pence

  -- Visibility
  display_to_non_members BOOLEAN NOT NULL DEFAULT true,

  -- Stripe IDs (null for free memberships)
  stripe_product_id TEXT,
  stripe_price_id TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for memberships
CREATE INDEX idx_memberships_organization ON public.memberships(organization_id);
CREATE INDEX idx_memberships_active ON public.memberships(organization_id, is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE public.memberships IS 'Membership tiers that organizations can offer';
COMMENT ON COLUMN public.memberships.price IS 'Membership price in pence. 0 = free membership';
COMMENT ON COLUMN public.memberships.billing_period IS 'How often the membership is billed: monthly, yearly, or one_time';
COMMENT ON COLUMN public.memberships.display_to_non_members IS 'If false, only users with this membership can see it (for private invites)';
COMMENT ON COLUMN public.memberships.stripe_product_id IS 'Stripe Product ID on Connected Account (null for free memberships)';
COMMENT ON COLUMN public.memberships.stripe_price_id IS 'Stripe Price ID on Connected Account (null for free memberships)';

-- 2. Create session_membership_prices table for per-session overrides
CREATE TABLE public.session_membership_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_template_id UUID NOT NULL REFERENCES public.session_templates(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  override_price INTEGER NOT NULL, -- in pence
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_template_id, membership_id)
);

-- Indexes for session_membership_prices
CREATE INDEX idx_session_membership_prices_template ON public.session_membership_prices(session_template_id);
CREATE INDEX idx_session_membership_prices_membership ON public.session_membership_prices(membership_id);

-- Comments
COMMENT ON TABLE public.session_membership_prices IS 'Per-membership price overrides for sessions';
COMMENT ON COLUMN public.session_membership_prices.override_price IS 'Override price in pence for this membership on this session';

-- 3. Add membership_id to user_memberships
ALTER TABLE public.user_memberships
  ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL;

-- Index for membership lookups
CREATE INDEX IF NOT EXISTS idx_user_memberships_membership ON public.user_memberships(membership_id);

-- Comment
COMMENT ON COLUMN public.user_memberships.membership_id IS 'Reference to the specific membership tier';

-- 4. Updated_at trigger for new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS update_memberships_updated_at ON public.memberships;
DROP TRIGGER IF EXISTS update_session_membership_prices_updated_at ON public.session_membership_prices;

CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON public.memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_membership_prices_updated_at
    BEFORE UPDATE ON public.session_membership_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS policies for memberships
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- Anyone can view active memberships that are visible to non-members
CREATE POLICY "Anyone can view visible active memberships" ON public.memberships
  FOR SELECT USING (
    is_active = true AND display_to_non_members = true
  );

-- Service role can do anything (for admin operations via server actions)
CREATE POLICY "Service role has full access to memberships" ON public.memberships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. RLS policies for session_membership_prices
ALTER TABLE public.session_membership_prices ENABLE ROW LEVEL SECURITY;

-- Anyone can view session membership prices
CREATE POLICY "Anyone can view session membership prices" ON public.session_membership_prices
  FOR SELECT USING (true);

-- Service role can do anything
CREATE POLICY "Service role has full access to session membership prices" ON public.session_membership_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
