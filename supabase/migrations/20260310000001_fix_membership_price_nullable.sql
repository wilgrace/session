-- Make override_price nullable in session_membership_prices
-- NULL means "use the membership's default pricing" rather than requiring an explicit override
ALTER TABLE public.session_membership_prices
  ALTER COLUMN override_price DROP NOT NULL;
