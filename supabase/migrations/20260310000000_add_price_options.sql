-- ============================================================================
-- Add flexible Price Options system
-- Replaces hard-coded drop_in_price / pricing_type / member_price columns with
-- a flexible org-level price_options table, mirroring the memberships pattern.
-- ============================================================================

-- ============================================================================
-- 1. NEW TABLES
-- ============================================================================

-- Org-level ticket types (e.g. Standard, Bring a Friend, Private Hire)
CREATE TABLE IF NOT EXISTS public.price_options (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  price           integer NOT NULL DEFAULT 0,       -- in pence
  spaces          integer NOT NULL DEFAULT 1,       -- capacity slots consumed per booking
  include_in_filter boolean NOT NULL DEFAULT false, -- show as calendar filter option
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_options_pkey PRIMARY KEY (id)
);

-- Template-level enable/price/spaces overrides per price option
CREATE TABLE IF NOT EXISTS public.session_price_options (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  session_template_id uuid NOT NULL REFERENCES public.session_templates(id) ON DELETE CASCADE,
  price_option_id     uuid NOT NULL REFERENCES public.price_options(id) ON DELETE CASCADE,
  is_enabled          boolean NOT NULL DEFAULT true,
  override_price      integer,   -- null = use price_options.price
  override_spaces     integer,   -- null = use price_options.spaces
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_price_options_pkey PRIMARY KEY (id),
  CONSTRAINT session_price_options_unique UNIQUE (session_template_id, price_option_id)
);

-- Instance-level overrides per price option (null fields = inherit from template)
CREATE TABLE IF NOT EXISTS public.instance_price_options (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  session_instance_id uuid NOT NULL REFERENCES public.session_instances(id) ON DELETE CASCADE,
  price_option_id     uuid NOT NULL REFERENCES public.price_options(id) ON DELETE CASCADE,
  is_enabled          boolean,   -- null = inherit; false = disabled for this instance
  override_price      integer,   -- null = inherit from template/global
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_price_options_pkey PRIMARY KEY (id),
  CONSTRAINT instance_price_options_unique UNIQUE (session_instance_id, price_option_id)
);

-- Instance-level overrides per membership (null fields = inherit from template)
CREATE TABLE IF NOT EXISTS public.instance_membership_overrides (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  session_instance_id uuid NOT NULL REFERENCES public.session_instances(id) ON DELETE CASCADE,
  membership_id       uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  is_enabled          boolean,   -- null = inherit; false = disabled for this instance
  override_price      integer,   -- null = inherit from session_membership_prices
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instance_membership_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT instance_membership_overrides_unique UNIQUE (session_instance_id, membership_id)
);

-- ============================================================================
-- 2. NEW COLUMNS ON EXISTING TABLES
-- ============================================================================

-- Schedule-level capacity (optional; sits between template default and instance override)
ALTER TABLE public.session_schedules
  ADD COLUMN IF NOT EXISTS capacity integer;

-- Instance-level capacity override (highest priority in resolution hierarchy)
ALTER TABLE public.session_instances
  ADD COLUMN IF NOT EXISTS capacity_override integer;

-- Track which price option was used for a booking (nullable for legacy / free bookings)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS price_option_id uuid REFERENCES public.price_options(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. DATA MIGRATION
-- Convert existing drop_in_price data into price_options + session_price_options.
-- Creates one org-level "Standard" price option per org, then links each paid
-- template to it via session_price_options (using override_price to preserve
-- the template-specific price).
-- ============================================================================

-- Create one "Standard" price option per org that has at least one paid template.
-- We use price = 0 as the global default; the actual price lives in the
-- session_price_options.override_price for each template.
INSERT INTO public.price_options (id, organization_id, name, description, price, spaces, include_in_filter, is_active, sort_order)
SELECT
  gen_random_uuid(),
  st.organization_id,
  'Standard',
  'Standard booking price',
  0,    -- global default price (overridden per-template below)
  1,    -- 1 space per booking
  false,
  true,
  0
FROM public.session_templates st
WHERE st.organization_id IS NOT NULL
  AND st.pricing_type = 'paid'
  AND st.drop_in_price IS NOT NULL
  AND st.deleted_at IS NULL
GROUP BY st.organization_id
ON CONFLICT DO NOTHING;

-- Link each paid template to its org's Standard price option,
-- setting override_price to preserve the original drop_in_price.
INSERT INTO public.session_price_options (session_template_id, price_option_id, is_enabled, override_price)
SELECT
  st.id,
  po.id,
  true,
  st.drop_in_price
FROM public.session_templates st
JOIN public.price_options po
  ON po.organization_id = st.organization_id
  AND po.name = 'Standard'
WHERE st.pricing_type = 'paid'
  AND st.drop_in_price IS NOT NULL
  AND st.deleted_at IS NULL
ON CONFLICT (session_template_id, price_option_id) DO UPDATE
  SET override_price = EXCLUDED.override_price;

-- ============================================================================
-- 4. DROP OBSOLETE COLUMNS
-- ============================================================================

-- session_templates: pricing now handled entirely by price_options
ALTER TABLE public.session_templates
  DROP COLUMN IF EXISTS pricing_type,
  DROP COLUMN IF EXISTS drop_in_price,
  DROP COLUMN IF EXISTS drop_in_enabled,
  DROP COLUMN IF EXISTS member_price;

-- session_instances: pricing overrides replaced by instance_price_options
ALTER TABLE public.session_instances
  DROP COLUMN IF EXISTS pricing_type_override,
  DROP COLUMN IF EXISTS drop_in_price_override,
  DROP COLUMN IF EXISTS member_price_override;

-- organizations: default drop-in price replaced by org-level price_options
ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS default_dropin_price;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.price_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_price_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_price_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_membership_overrides ENABLE ROW LEVEL SECURITY;

-- price_options: public can read active options (needed for booking page)
CREATE POLICY "Public can read active price_options"
  ON public.price_options FOR SELECT
  USING (is_active = true);

-- price_options: admins can manage their org's options
CREATE POLICY "Admins manage price_options"
  ON public.price_options FOR ALL
  USING (organization_id = (auth.jwt() ->> 'org_id'))
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id'));

-- session_price_options: public can read (needed to resolve booking options)
CREATE POLICY "Public can read session_price_options"
  ON public.session_price_options FOR SELECT
  USING (true);

-- session_price_options: admins can manage
CREATE POLICY "Admins manage session_price_options"
  ON public.session_price_options FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_templates st
      WHERE st.id = session_template_id
        AND st.organization_id = (auth.jwt() ->> 'org_id')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_templates st
      WHERE st.id = session_template_id
        AND st.organization_id = (auth.jwt() ->> 'org_id')
    )
  );

-- instance_price_options: public can read
CREATE POLICY "Public can read instance_price_options"
  ON public.instance_price_options FOR SELECT
  USING (true);

-- instance_price_options: admins can manage
CREATE POLICY "Admins manage instance_price_options"
  ON public.instance_price_options FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_instances si
      JOIN public.session_templates st ON st.id = si.template_id
      WHERE si.id = session_instance_id
        AND st.organization_id = (auth.jwt() ->> 'org_id')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_instances si
      JOIN public.session_templates st ON st.id = si.template_id
      WHERE si.id = session_instance_id
        AND st.organization_id = (auth.jwt() ->> 'org_id')
    )
  );

-- instance_membership_overrides: public can read
CREATE POLICY "Public can read instance_membership_overrides"
  ON public.instance_membership_overrides FOR SELECT
  USING (true);

-- instance_membership_overrides: admins can manage
CREATE POLICY "Admins manage instance_membership_overrides"
  ON public.instance_membership_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.session_instances si
      JOIN public.session_templates st ON st.id = si.template_id
      WHERE si.id = session_instance_id
        AND st.organization_id = (auth.jwt() ->> 'org_id')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_instances si
      JOIN public.session_templates st ON st.id = si.template_id
      WHERE si.id = session_instance_id
        AND st.organization_id = (auth.jwt() ->> 'org_id')
    )
  );
