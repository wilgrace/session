-- Add override_spaces to instance_price_options
-- Mirrors the session_price_options.override_spaces column, allowing per-instance spaces overrides

ALTER TABLE public.instance_price_options
  ADD COLUMN IF NOT EXISTS override_spaces integer; -- null = inherit from template/global
