-- Auto-assign superadmins to new organizations
-- When a new organization is created, all users with role='superadmin'
-- are automatically given superadmin access to that organization.

-- Function to assign all superadmins to a new organization
CREATE OR REPLACE FUNCTION public.assign_superadmins_to_new_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert assignments for all superadmin users
  INSERT INTO public.user_organization_assignments (user_id, organization_id, role, is_primary)
  SELECT
    cu.id,
    NEW.id,
    'superadmin'::user_role,
    false  -- New orgs are not primary by default
  FROM public.clerk_users cu
  WHERE cu.role = 'superadmin'
  ON CONFLICT (user_id, organization_id) DO NOTHING;  -- Skip if already assigned

  RETURN NEW;
END;
$$;

-- Trigger to run after organization insert
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_superadmins_to_new_org();

-- Also create a function to assign a user to all orgs when they become a superadmin
CREATE OR REPLACE FUNCTION public.assign_superadmin_to_all_orgs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only run when role changes TO superadmin
  IF NEW.role = 'superadmin' AND (OLD.role IS NULL OR OLD.role != 'superadmin') THEN
    -- Insert assignments for all organizations
    INSERT INTO public.user_organization_assignments (user_id, organization_id, role, is_primary)
    SELECT
      NEW.id,
      o.id,
      'superadmin'::user_role,
      CASE WHEN o.id = NEW.organization_id THEN true ELSE false END
    FROM public.organizations o
    ON CONFLICT (user_id, organization_id)
    DO UPDATE SET role = 'superadmin';  -- Upgrade existing assignments to superadmin
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to run after clerk_users update (when role changes)
DROP TRIGGER IF EXISTS on_user_becomes_superadmin ON public.clerk_users;
CREATE TRIGGER on_user_becomes_superadmin
  AFTER UPDATE OF role ON public.clerk_users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_superadmin_to_all_orgs();

-- Also run on insert for new superadmin users
DROP TRIGGER IF EXISTS on_superadmin_created ON public.clerk_users;
CREATE TRIGGER on_superadmin_created
  AFTER INSERT ON public.clerk_users
  FOR EACH ROW
  WHEN (NEW.role = 'superadmin')
  EXECUTE FUNCTION public.assign_superadmin_to_all_orgs();
