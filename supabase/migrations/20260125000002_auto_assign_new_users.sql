-- Auto-assign new users to their organization
-- When a new user is created in clerk_users, automatically create
-- a user_organization_assignment entry for them.

-- Function to create assignment when user is inserted
CREATE OR REPLACE FUNCTION public.assign_user_to_org_on_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create assignment if user has an organization_id
  IF NEW.organization_id IS NOT NULL THEN
    INSERT INTO public.user_organization_assignments (
      user_id,
      organization_id,
      role,
      is_primary
    )
    VALUES (
      NEW.id,
      NEW.organization_id,
      COALESCE(NEW.role, 'user'),  -- Use the user's role, default to 'user'
      true  -- Primary org for this user
    )
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to run after clerk_users insert
-- Note: This runs AFTER the superadmin triggers, so it won't conflict
DROP TRIGGER IF EXISTS on_clerk_user_created ON public.clerk_users;
CREATE TRIGGER on_clerk_user_created
  AFTER INSERT ON public.clerk_users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_user_to_org_on_create();

-- Backfill: Create assignments for any existing users who don't have them
INSERT INTO public.user_organization_assignments (user_id, organization_id, role, is_primary)
SELECT
  cu.id,
  cu.organization_id,
  COALESCE(cu.role, 'user'),
  true
FROM public.clerk_users cu
WHERE cu.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_organization_assignments uoa
    WHERE uoa.user_id = cu.id AND uoa.organization_id = cu.organization_id
  );
