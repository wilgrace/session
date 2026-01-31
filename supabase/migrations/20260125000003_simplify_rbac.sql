-- Simplify RBAC: Remove user_organization_assignments table
-- Superadmins can access any org (checked in middleware)
-- Regular users/admins use clerk_users.organization_id directly

-- Drop triggers on organizations table
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;

-- Drop triggers on clerk_users table
DROP TRIGGER IF EXISTS on_user_becomes_superadmin ON public.clerk_users;
DROP TRIGGER IF EXISTS on_superadmin_created ON public.clerk_users;
DROP TRIGGER IF EXISTS on_clerk_user_created ON public.clerk_users;

-- Drop functions
DROP FUNCTION IF EXISTS public.assign_superadmins_to_new_org();
DROP FUNCTION IF EXISTS public.assign_superadmin_to_all_orgs();
DROP FUNCTION IF EXISTS public.assign_user_to_org_on_create();

-- Drop the policy that references user_organization_assignments
DROP POLICY IF EXISTS "Admins can manage org memberships" ON public.user_memberships;

-- Drop the junction table (use CASCADE to handle any remaining dependencies)
DROP TABLE IF EXISTS public.user_organization_assignments CASCADE;

-- Recreate the membership policy using simplified logic
-- Superadmins can manage all memberships
-- Admins can manage memberships for their own org
CREATE POLICY "Admins can manage org memberships"
  ON public.user_memberships
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clerk_users cu
      WHERE cu.clerk_user_id = auth.uid()::text
      AND (
        cu.role = 'superadmin'
        OR (cu.role = 'admin' AND cu.organization_id = user_memberships.organization_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clerk_users cu
      WHERE cu.clerk_user_id = auth.uid()::text
      AND (
        cu.role = 'superadmin'
        OR (cu.role = 'admin' AND cu.organization_id = user_memberships.organization_id)
      )
    )
  );
