-- Migration: Allow admins to read users in their organization from clerk_users

-- Drop the policy if it already exists to avoid conflicts
DROP POLICY IF EXISTS "Admins can read users in their organization" ON public.clerk_users;

-- Create the new policy
CREATE POLICY "Admins can read users in their organization"
ON public.clerk_users
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.clerk_users WHERE clerk_user_id = auth.uid()::text
  )
); 