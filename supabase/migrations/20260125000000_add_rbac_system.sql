-- RBAC System Migration
-- Adds role-based access control with multi-org support for superadmins

-- 1. Create role enum
CREATE TYPE user_role AS ENUM ('guest', 'user', 'admin', 'superadmin');

-- 2. Create membership status enum
CREATE TYPE membership_status AS ENUM ('none', 'active', 'expired', 'cancelled');

-- 3. Add role column to clerk_users (keep is_super_admin temporarily for data migration)
ALTER TABLE public.clerk_users
  ADD COLUMN role user_role NOT NULL DEFAULT 'user';

-- 4. Migrate existing is_super_admin data to role column
UPDATE public.clerk_users SET role = 'superadmin' WHERE is_super_admin = true;
UPDATE public.clerk_users SET role = 'user' WHERE is_super_admin = false OR is_super_admin IS NULL;

-- 5. Create user_organization_assignments junction table
CREATE TABLE public.user_organization_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.clerk_users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'user',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- 6. Create initial assignments from existing organization_id
INSERT INTO public.user_organization_assignments (user_id, organization_id, role, is_primary)
SELECT id, organization_id, role, true
FROM public.clerk_users
WHERE organization_id IS NOT NULL;

-- 7. Create user_memberships table for future subscription support
CREATE TABLE public.user_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.clerk_users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status membership_status NOT NULL DEFAULT 'none',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- 8. Add member pricing columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN member_price_type TEXT DEFAULT 'discount',
  ADD COLUMN member_discount_percent INTEGER,
  ADD COLUMN member_fixed_price INTEGER;

-- 9. Add member price override to session_templates
ALTER TABLE public.session_templates
  ADD COLUMN member_price INTEGER;

-- 10. Create indexes for performance
CREATE INDEX idx_user_org_assignments_user_id ON public.user_organization_assignments(user_id);
CREATE INDEX idx_user_org_assignments_org_id ON public.user_organization_assignments(organization_id);
CREATE INDEX idx_user_memberships_user_id ON public.user_memberships(user_id);
CREATE INDEX idx_user_memberships_org_id ON public.user_memberships(organization_id);
CREATE INDEX idx_user_memberships_status ON public.user_memberships(status);

-- 11. Add update trigger for user_organization_assignments
CREATE TRIGGER on_user_org_assignments_update
  BEFORE UPDATE ON public.user_organization_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 12. Add update trigger for user_memberships
CREATE TRIGGER on_user_memberships_update
  BEFORE UPDATE ON public.user_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 13. Enable RLS on new tables
ALTER TABLE public.user_organization_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;

-- 14. RLS policies for user_organization_assignments
-- Users can read their own assignments
CREATE POLICY "Users can read own org assignments"
  ON public.user_organization_assignments
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.clerk_users WHERE clerk_user_id = auth.uid()::text
    )
  );

-- Admins can read assignments for their orgs
CREATE POLICY "Admins can read org assignments"
  ON public.user_organization_assignments
  FOR SELECT
  USING (
    organization_id IN (
      SELECT uoa.organization_id
      FROM public.user_organization_assignments uoa
      JOIN public.clerk_users cu ON cu.id = uoa.user_id
      WHERE cu.clerk_user_id = auth.uid()::text
      AND uoa.role IN ('admin', 'superadmin')
    )
  );

-- Admins can manage assignments for their orgs
CREATE POLICY "Admins can manage org assignments"
  ON public.user_organization_assignments
  FOR ALL
  USING (
    organization_id IN (
      SELECT uoa.organization_id
      FROM public.user_organization_assignments uoa
      JOIN public.clerk_users cu ON cu.id = uoa.user_id
      WHERE cu.clerk_user_id = auth.uid()::text
      AND uoa.role IN ('admin', 'superadmin')
    )
  );

-- 15. RLS policies for user_memberships
-- Users can read their own memberships
CREATE POLICY "Users can read own memberships"
  ON public.user_memberships
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.clerk_users WHERE clerk_user_id = auth.uid()::text
    )
  );

-- Admins can read/manage memberships for their orgs
CREATE POLICY "Admins can manage org memberships"
  ON public.user_memberships
  FOR ALL
  USING (
    organization_id IN (
      SELECT uoa.organization_id
      FROM public.user_organization_assignments uoa
      JOIN public.clerk_users cu ON cu.id = uoa.user_id
      WHERE cu.clerk_user_id = auth.uid()::text
      AND uoa.role IN ('admin', 'superadmin')
    )
  );

-- 16. Drop is_super_admin column (data has been migrated)
ALTER TABLE public.clerk_users DROP COLUMN is_super_admin;
