-- Fix function search_path security warnings
-- This migration sets search_path to empty string for all functions to prevent search_path injection attacks
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- Fix ensure_clerk_user function (with 4 parameters)
CREATE OR REPLACE FUNCTION public.ensure_clerk_user(
  p_clerk_user_id text,
  p_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_default_org_id text;
BEGIN
  -- Check if user exists
  SELECT id INTO v_user_id
  FROM public.clerk_users
  WHERE clerk_user_id = p_clerk_user_id;

  -- If user doesn't exist, create them
  IF v_user_id IS NULL THEN
    -- Get the default organization ID
    SELECT id INTO v_default_org_id
    FROM public.organizations
    WHERE name = 'Default Organization';

    -- If no default organization exists, create one
    IF v_default_org_id IS NULL THEN
      INSERT INTO public.organizations (id, name)
      VALUES ('org_default', 'Default Organization')
      RETURNING id INTO v_default_org_id;
    END IF;

    -- Create the user
    INSERT INTO public.clerk_users (
      clerk_user_id,
      email,
      first_name,
      last_name,
      organization_id
    )
    VALUES (
      p_clerk_user_id,
      p_email,
      p_first_name,
      p_last_name,
      v_default_org_id
    )
    RETURNING id INTO v_user_id;
  END IF;

  RETURN v_user_id;
END;
$$;

-- Fix ensure_clerk_user function (with 5 parameters including organization_id)
CREATE OR REPLACE FUNCTION public.ensure_clerk_user(
  p_clerk_user_id text,
  p_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if user exists
  SELECT id INTO v_user_id
  FROM public.clerk_users
  WHERE clerk_user_id = p_clerk_user_id;

  -- If user doesn't exist, create them
  IF v_user_id IS NULL THEN
    INSERT INTO public.clerk_users (
      clerk_user_id,
      email,
      first_name,
      last_name,
      organization_id
    )
    VALUES (
      p_clerk_user_id,
      p_email,
      p_first_name,
      p_last_name,
      p_organization_id
    )
    RETURNING id INTO v_user_id;
  END IF;

  RETURN v_user_id;
END;
$$;

-- Fix handle_updated_at function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, NOW());
  RETURN NEW;
END;
$$;

-- Fix trigger_instance_generation function
CREATE OR REPLACE FUNCTION public.trigger_instance_generation(template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Call the Edge Function using pg_net
  PERFORM net.http_post(
    url := 'http://localhost:54321/functions/v1/generate-instances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('template_id_to_process', template_id)
  );
END;
$$;

-- Fix handle_organization_change function
CREATE OR REPLACE FUNCTION public.handle_organization_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Call the existing clerk-webhook-handler Edge Function
  PERFORM net.http_post(
    url := 'http://localhost:54321/functions/v1/clerk-webhook-handler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'svix-id', gen_random_uuid()::text,
      'svix-timestamp', extract(epoch from now())::text,
      'svix-signature', 'test-signature' -- This will be treated as a test event
    ),
    body := jsonb_build_object(
      'type', 'organization.updated',
      'data', jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'slug', NEW.id,
        'created_at', extract(epoch from NEW.created_at)::bigint,
        'updated_at', extract(epoch from NEW.updated_at)::bigint,
        'created_by', 'system',
        'public_metadata', jsonb_build_object(
          'description', NEW.description,
          'logo_url', NEW.logo_url
        ),
        'private_metadata', '{}'::jsonb
      ),
      'object', 'event',
      'timestamp', extract(epoch from now())::bigint
    )
  );
  RETURN NEW;
END;
$$;

-- Fix log_rls_check function
CREATE OR REPLACE FUNCTION public.log_rls_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  auth_uid text;
  clerk_user_id text;
BEGIN
  auth_uid := auth.uid()::text;
  SELECT cu.clerk_user_id INTO clerk_user_id 
  FROM public.clerk_users cu 
  WHERE cu.id = NEW.user_id;
  
  RAISE NOTICE 'RLS Debug - Auth UID: %, Clerk User ID: %, Match: %',
    auth_uid,
    clerk_user_id,
    auth_uid = clerk_user_id;
    
  RETURN NEW;
END;
$$;

