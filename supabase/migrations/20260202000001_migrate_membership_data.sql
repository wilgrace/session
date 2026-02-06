-- ============================================
-- Migration: Migrate existing membership data to new structure
-- ============================================

-- For each organization that has membership configured (has a membership price in stripe_connect_accounts),
-- create a membership record in the new memberships table
INSERT INTO public.memberships (
  organization_id,
  name,
  description,
  price,
  billing_period,
  member_price_type,
  member_discount_percent,
  member_fixed_price,
  stripe_product_id,
  stripe_price_id,
  is_active,
  sort_order
)
SELECT
  o.id AS organization_id,
  'Monthly Membership' AS name,
  'Member pricing on all sessions' AS description,
  COALESCE(sca.membership_monthly_price, 0) AS price,
  'monthly' AS billing_period,
  COALESCE(o.member_price_type, 'discount') AS member_price_type,
  o.member_discount_percent,
  o.member_fixed_price,
  sca.membership_product_id,
  sca.membership_price_id,
  CASE WHEN sca.membership_price_id IS NOT NULL THEN true ELSE false END AS is_active,
  0 AS sort_order
FROM public.organizations o
LEFT JOIN public.stripe_connect_accounts sca ON sca.organization_id = o.id
WHERE sca.membership_price_id IS NOT NULL
   OR o.member_price_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update user_memberships to reference the new membership record
-- Match based on organization_id and only for active/cancelled memberships
UPDATE public.user_memberships um
SET membership_id = m.id
FROM public.memberships m
WHERE m.organization_id = um.organization_id
  AND um.membership_id IS NULL
  AND um.status IN ('active', 'cancelled');

-- Note: We keep the old columns for now (member_price_type etc on organizations
-- and membership_product_id etc on stripe_connect_accounts).
-- They will be removed in a future cleanup migration after confirming data integrity.
