-- Create stripe_connect_accounts table for Stripe Connect integration
CREATE TABLE stripe_connect_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL DEFAULT 'standard',
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  country TEXT DEFAULT 'GB',
  default_currency TEXT DEFAULT 'gbp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX idx_stripe_connect_org ON stripe_connect_accounts(organization_id);
CREATE INDEX idx_stripe_account_id ON stripe_connect_accounts(stripe_account_id);

-- Enable Row Level Security
ALTER TABLE stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by server actions and webhooks)
CREATE POLICY "Service role full access" ON stripe_connect_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_stripe_connect_accounts_updated_at
  BEFORE UPDATE ON stripe_connect_accounts
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
