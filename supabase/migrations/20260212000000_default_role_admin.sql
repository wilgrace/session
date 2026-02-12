-- Change the default role for new signups from 'user' to 'admin'

-- Update the column default on clerk_users
ALTER TABLE public.clerk_users
  ALTER COLUMN role SET DEFAULT 'admin';

-- Update the auto-assign trigger function to default to 'admin'
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
      COALESCE(NEW.role, 'admin'),  -- Use the user's role, default to 'admin'
      true  -- Primary org for this user
    )
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
