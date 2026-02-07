-- Add waivers system for terms & conditions
-- Organizations can create waivers that users must agree to during signup

-- Create waivers table
CREATE TABLE waivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  agreement_type TEXT NOT NULL DEFAULT 'checkbox', -- 'checkbox' | 'signature'
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create waiver_agreements table (audit trail)
CREATE TABLE waiver_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES clerk_users(id) ON DELETE CASCADE,
  waiver_id UUID NOT NULL REFERENCES waivers(id) ON DELETE CASCADE,
  waiver_version INTEGER NOT NULL,
  agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agreement_type TEXT NOT NULL, -- 'checkbox' | 'signature'
  signature_data TEXT, -- Base64 PNG for signature type
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_waivers_org_active ON waivers(organization_id, is_active);
CREATE INDEX idx_waivers_organization ON waivers(organization_id);
CREATE INDEX idx_waiver_agreements_user ON waiver_agreements(user_id);
CREATE INDEX idx_waiver_agreements_waiver ON waiver_agreements(waiver_id);
CREATE INDEX idx_waiver_agreements_user_waiver ON waiver_agreements(user_id, waiver_id);

-- Add update trigger for waivers
CREATE TRIGGER update_waivers_updated_at
  BEFORE UPDATE ON waivers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiver_agreements ENABLE ROW LEVEL SECURITY;

-- RLS policies for waivers
-- Service role has full access (for server actions)
CREATE POLICY "Service role full access to waivers"
  ON waivers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anyone can read active waivers (needed for signup flow)
CREATE POLICY "Anyone can read active waivers"
  ON waivers
  FOR SELECT
  USING (is_active = true);

-- RLS policies for waiver_agreements
-- Service role has full access (for server actions)
CREATE POLICY "Service role full access to waiver_agreements"
  ON waiver_agreements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE waivers IS 'Waiver/agreement templates that organizations can require users to acknowledge';
COMMENT ON COLUMN waivers.agreement_type IS 'How users agree: checkbox (tick box) or signature (drawn signature)';
COMMENT ON COLUMN waivers.version IS 'Version number, incremented when content changes significantly';
COMMENT ON COLUMN waivers.is_active IS 'Only one waiver can be active per organization at a time';

COMMENT ON TABLE waiver_agreements IS 'Audit trail of user waiver acknowledgments';
COMMENT ON COLUMN waiver_agreements.waiver_version IS 'Version of the waiver that was agreed to';
COMMENT ON COLUMN waiver_agreements.signature_data IS 'Base64 encoded PNG of signature (for signature type only)';
COMMENT ON COLUMN waiver_agreements.ip_address IS 'IP address of user at time of agreement';
COMMENT ON COLUMN waiver_agreements.user_agent IS 'Browser user agent at time of agreement';
