SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_user_id uuid;
begin
  -- Check if user exists
  select id into v_user_id
  from public.clerk_users
  where clerk_user_id = p_clerk_user_id;

  -- If user doesn't exist, create them
  if v_user_id is null then
    insert into public.clerk_users (
      clerk_user_id,
      email,
      first_name,
      last_name,
      organization_id
    )
    values (
      p_clerk_user_id,
      p_email,
      p_first_name,
      p_last_name,
      p_organization_id
    )
    returning id into v_user_id;
  end if;

  return v_user_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, NOW());
  RETURN NEW;
END;
$$;

SET default_tablespace = '';
SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."clerk_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "date_of_birth" "date",
    "gender" "text",
    "ethnicity" "text",
    "home_postal_code" "text",
    "clerk_user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."saunas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "capacity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."session_instances" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "original_start_time" timestamp with time zone,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "is_exception" boolean DEFAULT false NOT NULL,
    "notes_for_instance" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chk_end_time_after_start_time" CHECK (("end_time" > "start_time")),
    CONSTRAINT "chk_exception_original_time" CHECK (((("is_exception" = true) AND ("original_start_time" IS NOT NULL)) OR (("is_exception" = false) AND ("original_start_time" IS NULL))))
);

CREATE TABLE IF NOT EXISTS "public"."session_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_template_id" "uuid" NOT NULL,
    "day_of_week" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "time" "time" NOT NULL,
    CONSTRAINT "recurring_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);

CREATE TABLE IF NOT EXISTS "public"."session_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sauna_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "capacity" integer NOT NULL,
    "duration_minutes" integer NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "one_off_start_time" timestamp with time zone,
    "recurrence_start_date" "date",
    "recurrence_end_date" "date",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chk_recurring_fields" CHECK (((("is_recurring" = true) AND ("one_off_start_time" IS NULL) AND ("recurrence_start_date" IS NOT NULL)) OR (("is_recurring" = false) AND ("one_off_start_time" IS NOT NULL) AND ("recurrence_start_date" IS NULL) AND ("recurrence_end_date" IS NULL))))
);

CREATE OR REPLACE TRIGGER "on_saunas_update" BEFORE UPDATE ON "public"."saunas" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "on_session_instances_update" BEFORE UPDATE ON "public"."session_instances" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "on_session_schedules_update" BEFORE UPDATE ON "public"."session_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "on_session_templates_update" BEFORE UPDATE ON "public"."session_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

-- Create a function to call the Edge Function
CREATE OR REPLACE FUNCTION public.trigger_instance_generation(template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

RESET ALL;

-- Reset the database (order matters due to foreign key constraints)
TRUNCATE TABLE public.bookings CASCADE;
TRUNCATE TABLE public.session_instances CASCADE;
TRUNCATE TABLE public.session_schedules CASCADE;
TRUNCATE TABLE public.session_templates CASCADE;
TRUNCATE TABLE public.stripe_connect_accounts CASCADE;
TRUNCATE TABLE public.user_memberships CASCADE;
TRUNCATE TABLE public.clerk_users CASCADE;
TRUNCATE TABLE public.organizations CASCADE;

-- Create sample organizations
INSERT INTO public.organizations (id, name, slug, description)
VALUES
  ('org_2wzj16iQknhJygxeSYnYoOX2MO4', 'Cardiff Community Sawna', 'cardiff', 'Cardiff''s community-run mobile sauna bringing warmth and wellness to the city.'),
  ('org_bristol_sawna_001', 'Bristol Community Sawna', 'bristol', 'Bristol''s community sauna experience bringing warmth to the harbour city.');

-- Create sample clerk users
INSERT INTO public.clerk_users (
  id,
  clerk_user_id,
  email,
  first_name,
  last_name,
  organization_id,
  role
)
VALUES
  ('4e376853-0880-4b3e-a669-edf561e116dc', 'user_2y6VL5FKMg9cwwlLvbjg01GPlxT', 'wil.grace@gmail.com', 'Wil', 'Grace', 'org_2wzj16iQknhJygxeSYnYoOX2MO4', 'superadmin');

-- Note: Superadmins can access any organization without explicit assignments.
-- The middleware checks the role directly from clerk_users table.

-- Create sample Stripe Connect account (connected and ready to accept payments)
INSERT INTO public.stripe_connect_accounts (
  id,
  organization_id,
  stripe_account_id,
  account_type,
  details_submitted,
  charges_enabled,
  payouts_enabled,
  country,
  default_currency
)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'org_2wzj16iQknhJygxeSYnYoOX2MO4', 'acct_1Ss2rZ8sdPMiIqvN', 'standard', true, true, true, 'GB', 'gbp'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'org_bristol_sawna_001', 'acct_1Ss2Yt9k1BV0JX1c', 'standard', true, true, true, 'GB', 'gbp');

-- Create sample session templates
INSERT INTO public.session_templates (
  id,
  organization_id,
  name,
  description,
  capacity,
  duration_minutes,
  is_open,
  is_recurring,
  recurrence_start_date,
  recurrence_end_date,
  created_by,
  timezone,
  pricing_type,
  drop_in_price,
  booking_instructions,
  image_url
)
VALUES
  -- Regular paid sauna session (recurring)
  (
    '11111111-1111-1111-1111-111111111111',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Regular Sauna Session',
    'Our standard 90-minute sauna session. Includes use of the sauna, cold plunge, and relaxation area. Towels provided.',
    10,
    90,
    true,
    true,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    1500, -- £15.00 in pence
    'Please arrive 10 minutes early. Bring swimwear and flip-flops. Towels are provided. The sauna is located at Pontcanna Fields car park.',
    NULL
  ),
  -- Free community session (recurring)
  (
    '22222222-2222-2222-2222-222222222222',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Community Free Session',
    'Free community sauna session. Open to all Cardiff residents. First-come, first-served basis.',
    8,
    60,
    true,
    true,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '3 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'free',
    NULL,
    'This is a free community session. Please contact us at hello@cardiffsawna.com for details on how to join.',
    NULL
  ),
  -- Premium evening session (recurring)
  (
    '33333333-3333-3333-3333-333333333333',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Evening Wellness Session',
    'Extended 2-hour evening session with guided breathing exercises and aromatherapy. Perfect for unwinding after work.',
    6,
    120,
    true,
    true,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    2500, -- £25.00 in pence
    'Arrive 15 minutes early for the breathing exercise introduction. Wear comfortable clothing. Herbal tea provided.',
    NULL
  ),
  -- Bristol: Harbourside Sauna Session (recurring)
  (
    '44444444-4444-4444-4444-444444444444',
    'org_bristol_sawna_001',
    'Harbourside Sauna',
    'Relax by the harbour with our 75-minute sauna session. Enjoy views of the waterfront while you unwind.',
    8,
    75,
    true,
    true,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    1200, -- £12.00 in pence
    'Meet at the Harbourside near the M Shed. Look for the sauna trailer. Bring swimwear and a towel.',
    NULL
  ),
  -- Bristol: Weekend Wellness (recurring)
  (
    '55555555-5555-5555-5555-555555555555',
    'org_bristol_sawna_001',
    'Weekend Wellness',
    'Start your weekend right with our Saturday morning sauna and cold plunge experience.',
    10,
    90,
    true,
    true,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    1800, -- £18.00 in pence
    'Arrive 10 minutes early. We provide towels and refreshments. Located at Castle Park.',
    NULL
  );

-- Create session schedules for recurring templates
INSERT INTO public.session_schedules (
  id,
  session_template_id,
  day_of_week,
  time,
  is_active,
  organization_id
)
VALUES
  -- Regular Sauna Session: Mon/Wed/Fri at 10:00, Sat/Sun at 09:00
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, '10:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Monday
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 3, '10:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Wednesday
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 5, '10:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Friday
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 6, '09:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Saturday
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 0, '09:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Sunday

  -- Community Free Session: Saturday at 14:00
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222', 6, '14:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Saturday

  -- Evening Wellness Session: Tue/Thu at 18:30
  ('00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 2, '18:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Tuesday
  ('00000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 4, '18:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'), -- Thursday

  -- Bristol: Harbourside Sauna: Wed/Fri at 11:00, Sun at 10:00
  ('00000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444444', 3, '11:00', true, 'org_bristol_sawna_001'), -- Wednesday
  ('00000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 5, '11:00', true, 'org_bristol_sawna_001'), -- Friday
  ('00000000-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444', 0, '10:00', true, 'org_bristol_sawna_001'), -- Sunday

  -- Bristol: Weekend Wellness: Saturday at 09:00
  ('00000000-0000-0000-0000-000000000006', '55555555-5555-5555-5555-555555555555', 6, '09:00', true, 'org_bristol_sawna_001') -- Saturday
