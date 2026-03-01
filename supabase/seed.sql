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
    CONSTRAINT "chk_exception_original_time" CHECK ((("is_exception" = true) AND ("original_start_time" IS NOT NULL)) OR (("is_exception" = false) AND ("original_start_time" IS NULL)))
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
    "visibility" "text" DEFAULT 'open' NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "one_off_start_time" timestamp with time zone,
    "recurrence_start_date" "date",
    "recurrence_end_date" "date",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chk_recurring_fields" CHECK (((("is_recurring" = true) AND ("one_off_start_time" IS NULL) AND ("recurrence_start_date" IS NOT NULL)) OR (("is_recurring" = false) AND ("one_off_start_time" IS NOT NULL) AND ("recurrence_start_date" IS NULL) AND ("recurrence_end_date" IS NULL))))
);

CREATE TABLE IF NOT EXISTS "public"."waivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "content" "text" NOT NULL,
    "agreement_type" "text" NOT NULL DEFAULT 'checkbox',
    "version" integer NOT NULL DEFAULT 1,
    "is_active" boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."waiver_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "waiver_id" "uuid" NOT NULL,
    "waiver_version" integer NOT NULL,
    "agreed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agreement_type" "text" NOT NULL,
    "signature_data" "text",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE OR REPLACE TRIGGER "on_session_instances_update" BEFORE UPDATE ON "public"."session_instances" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "on_session_schedules_update" BEFORE UPDATE ON "public"."session_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "on_session_templates_update" BEFORE UPDATE ON "public"."session_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "on_waivers_update" BEFORE UPDATE ON "public"."waivers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

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
TRUNCATE TABLE public.waiver_agreements CASCADE;
TRUNCATE TABLE public.bookings CASCADE;
TRUNCATE TABLE public.session_instances CASCADE;
TRUNCATE TABLE public.session_schedules CASCADE;
TRUNCATE TABLE public.session_templates CASCADE;
TRUNCATE TABLE public.session_membership_prices CASCADE;
TRUNCATE TABLE public.memberships CASCADE;
TRUNCATE TABLE public.waivers CASCADE;
TRUNCATE TABLE public.stripe_connect_accounts CASCADE;
TRUNCATE TABLE public.user_memberships CASCADE;
TRUNCATE TABLE public.clerk_users CASCADE;
TRUNCATE TABLE public.organizations CASCADE;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
INSERT INTO public.organizations (
  id,
  name,
  slug,
  description,
  logo_url,
  favicon_url,
  header_image_url,
  button_color,
  button_text_color,
  member_price_type
)
VALUES
  (
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Cardiff Community Sawna',
    'cardiff',
    'Cardiff''s community-run mobile sauna bringing warmth and wellness to the city.',
    'http://127.0.0.1:54321/storage/v1/object/public/session-images/sessions/user_2y6VL5FKMg9cwwlLvbjg01GPlxT-1770377969192.png',
    'http://127.0.0.1:54321/storage/v1/object/public/session-images/sessions/user_2y6VL5FKMg9cwwlLvbjg01GPlxT-1770377972513.png',
    'http://127.0.0.1:54321/storage/v1/object/public/session-images/sessions/user_2y6VL5FKMg9cwwlLvbjg01GPlxT-1770377978474.jpg',
    '#C9501C',
    '#ffffff',
    'discount'
  ),
  (
    'org_bristol_sauna_001',
    'Bristol Sawna',
    'bristol',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );

-- ============================================================================
-- CLERK USERS
-- ============================================================================
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
  (
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'user_2y6VL5FKMg9cwwlLvbjg01GPlxT',
    'wil.grace@gmail.com',
    'Wil',
    'Grace',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'superadmin'
  ),
  (
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'user_sample_booking_user_001',
    'sarah.jones@example.com',
    'Sarah',
    'Jones',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'user'
  ),
  (
    '6a598075-2aa2-5d5f-c88b-fef783f338fe',
    'user_sample_booking_user_002',
    'tom.williams@example.com',
    'Tom',
    'Williams',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'user'
  );

-- ============================================================================
-- WAIVERS
-- ============================================================================
INSERT INTO public.waivers (
  id,
  organization_id,
  title,
  summary,
  content,
  agreement_type,
  version,
  is_active
)
VALUES
  (
    'eb7f3ad9-b802-43aa-afa5-b041250056ca',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Waiver',
    'Please read and agree to these conditions',
    'Alcohol and nudity are not permitted in the sauna. The Sauna operators reserve the right to refuse admission to intoxicated persons.​

Children under the age of 16 are not permitted to use the sauna.

Any hanging jewellery should be removed before entering the sauna to prevent burning.

Any glasses or contact lenses should be removed before entering the sauna to avoid any damage to coatings and to prevent contact lenses from drying out.

Any footwear should be removed before entering the sauna.

The Sauna is not responsible for any lost, stolen, or damaged personal belongings.

All persons using the sauna do so at their own risk. I confirm that I do not have any medical conditions that would make sauna use unsafe for me, or I have consulted a medical professional who has confirmed sauna use is safe in my case.

You must not use the sauna if you:
- suffer from high or low blood pressure or any heart or circulatory disorder or suffer from epilepsy or diabetes;
- are pregnant; or
- are prone to dizziness or fainting.

Sauna etiquette must be adhered to at all times. This includes;
- Washing feet in the bucket provided before entering the sauna
- Sitting on a towel at all times
- Staying in the sauna for no longer than 20 min at a time (we recommend 5-15 min sessions)
- Gently pouring water onto the sauna stove; drizzle, don''t dump water
- Only pouring the provided "sauna water" on hot rocks and nothing else
- Getting changed within your booked time slot, if you''d like to use the changing room.

Please refrain from bringing your own essential oils and other products for the session as these cannot be used in our sauna. Essential oils that haven''t been approved for in-sauna use may react to the heat and release toxins, ignite on the stove, or create slippery surfaces inside the sauna.

If you are making this booking on behalf of a group, you confirm that all members of your group have read and agreed to these terms and conditions and understand that sauna and sea use are at their own risk and will practice safe sauna use.',
    'signature',
    2,
    true
  );

-- ============================================================================
-- STRIPE CONNECT ACCOUNTS
-- ============================================================================
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
  (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'acct_1Ss2rZ8sdPMiIqvN',
    'standard',
    true,
    true,
    true,
    'GB',
    'gbp'
  );

-- ============================================================================
-- MEMBERSHIPS
-- ============================================================================
INSERT INTO public.memberships (
  id,
  organization_id,
  name,
  description,
  image_url,
  price,
  billing_period,
  member_price_type,
  member_discount_percent,
  display_to_non_members,
  show_on_booking_page,
  show_on_membership_page,
  stripe_product_id,
  stripe_price_id,
  is_active,
  sort_order
)
VALUES
  -- Regular membership: £15/month, 50% discount
  (
    '8798523d-e737-4a82-ae92-c7da93286f91',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Regular',
    'For people who come once a week',
    'http://127.0.0.1:54321/storage/v1/object/public/session-images/sessions/user_2y6VL5FKMg9cwwlLvbjg01GPlxT-1770383229478.jpg',
    1500, -- £15.00 in pence
    'monthly',
    'discount',
    50,
    true,
    true,
    true,
    'prod_TvebqcXpOZ0pVD',
    'price_1SxnIA8sdPMiIqvNap3MKHiH',
    true,
    0
  ),
  -- Free membership: £0/month, 100% discount (for outreach)
  (
    '8990819e-aacb-494b-abf2-a54b0dd61d10',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Free',
    'For use during social outreach',
    'http://127.0.0.1:54321/storage/v1/object/public/session-images/sessions/user_2y6VL5FKMg9cwwlLvbjg01GPlxT-1770383208336.jpg',
    0, -- Free
    'monthly',
    'discount',
    100,
    true,
    true,
    true,
    NULL,
    NULL,
    true,
    1
  );

-- ============================================================================
-- SESSION TEMPLATES
-- ============================================================================
INSERT INTO public.session_templates (
  id,
  organization_id,
  name,
  description,
  capacity,
  duration_minutes,
  visibility,
  recurrence_start_date,
  recurrence_end_date,
  created_by,
  timezone,
  pricing_type,
  drop_in_price,
  booking_instructions,
  image_url,
  event_color
)
VALUES
  -- Communal - Off-Peak (Weekdays, Blue, £10)
  (
    '11111111-1111-1111-1111-111111111111',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Communal - Off-Peak',
    'Our standard 75-minute communal sauna session during off-peak hours. Includes use of the sauna, cold plunge, and relaxation area. Towels provided.',
    16,
    75,
    'open',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    1000, -- £10.00 in pence
    'Please arrive 10 minutes early. Bring swimwear and flip-flops. Towels are provided. The sauna is located at Pontcanna Fields car park.',
    NULL,
    'blue'
  ),
  -- Communal - Peak (Evenings/Weekends, Green, £15)
  (
    '22222222-2222-2222-2222-222222222222',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Communal - Peak',
    'Our standard 75-minute communal sauna session during peak hours. Includes use of the sauna, cold plunge, and relaxation area. Towels provided.',
    16,
    75,
    'open',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    1500, -- £15.00 in pence
    'Please arrive 10 minutes early. Bring swimwear and flip-flops. Towels are provided. The sauna is located at Pontcanna Fields car park.',
    NULL,
    'green'
  ),
  -- Concessions Only (Daily, Yellow, £5)
  (
    '33333333-3333-3333-3333-333333333333',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Concessions Only',
    'Discounted 75-minute communal sauna session for those who need a little help. Includes use of the sauna, cold plunge, and relaxation area. Towels provided.',
    16,
    75,
    'open',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'paid',
    500, -- £5.00 in pence
    'Please arrive 10 minutes early. Bring swimwear and flip-flops. Towels are provided. The sauna is located at Pontcanna Fields car park.',
    NULL,
    'yellow'
  ),
  -- Friends & Family (Monday, Hidden, Free)
  (
    '44444444-4444-4444-4444-444444444444',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'Friends & Family',
    'Special 75-minute sauna session for friends and family. Direct link only. Includes use of the sauna, cold plunge, and relaxation area. Towels provided.',
    16,
    75,
    'hidden',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '6 months',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'Europe/London',
    'free',
    NULL,
    'Please arrive 10 minutes early. Bring swimwear and flip-flops. Towels are provided. The sauna is located at Pontcanna Fields car park.',
    NULL,
    'blue'
  );

-- ============================================================================
-- SESSION SCHEDULES
-- Day of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
-- ============================================================================
INSERT INTO public.session_schedules (
  id,
  session_template_id,
  day_of_week,
  time,
  is_active,
  organization_id
)
VALUES
  -- ============================================================================
  -- Monday (day 1): Friends & Family only at 15:00
  -- ============================================================================
  ('a0000004-0004-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', 1, '15:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),

  -- ============================================================================
  -- Tuesday (day 2): Off-Peak at 12:00, 16:30, 18:00, 19:30 + Concessions at 15:00
  -- ============================================================================
  ('a0000001-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 2, '12:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000003-0003-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', 2, '15:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0002-0001-000000000002', '11111111-1111-1111-1111-111111111111', 2, '16:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0002-0001-000000000003', '11111111-1111-1111-1111-111111111111', 2, '18:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0002-0001-000000000004', '11111111-1111-1111-1111-111111111111', 2, '19:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),

  -- ============================================================================
  -- Wednesday (day 3): Peak at 12:00, 16:30, 18:00, 19:30 + Concessions at 15:00
  -- ============================================================================
  ('a0000002-0002-0003-0001-000000000001', '22222222-2222-2222-2222-222222222222', 3, '12:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000003-0003-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333', 3, '15:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0003-0001-000000000002', '22222222-2222-2222-2222-222222222222', 3, '16:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0003-0001-000000000003', '22222222-2222-2222-2222-222222222222', 3, '18:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0003-0001-000000000004', '22222222-2222-2222-2222-222222222222', 3, '19:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),

  -- ============================================================================
  -- Thursday (day 4): Peak at 07:30, 09:00 | Off-Peak at 10:30, 12:00, 16:30 | Concessions at 13:30 | Peak at 18:00, 19:30
  -- ============================================================================
  ('a0000002-0002-0004-0001-000000000001', '22222222-2222-2222-2222-222222222222', 4, '07:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0004-0001-000000000002', '22222222-2222-2222-2222-222222222222', 4, '09:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', 4, '10:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0004-0001-000000000002', '11111111-1111-1111-1111-111111111111', 4, '12:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000003-0003-0004-0001-000000000001', '33333333-3333-3333-3333-333333333333', 4, '13:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0004-0001-000000000003', '11111111-1111-1111-1111-111111111111', 4, '16:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0004-0001-000000000003', '22222222-2222-2222-2222-222222222222', 4, '18:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0004-0001-000000000004', '22222222-2222-2222-2222-222222222222', 4, '19:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),

  -- ============================================================================
  -- Friday (day 5): Peak at 07:30, 09:00 | Off-Peak at 10:30, 12:00, 16:30 | Concessions at 13:30 | Peak at 18:00, 19:30
  -- ============================================================================
  ('a0000002-0002-0005-0001-000000000001', '22222222-2222-2222-2222-222222222222', 5, '07:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0005-0001-000000000002', '22222222-2222-2222-2222-222222222222', 5, '09:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', 5, '10:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0005-0001-000000000002', '11111111-1111-1111-1111-111111111111', 5, '12:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000003-0003-0005-0001-000000000001', '33333333-3333-3333-3333-333333333333', 5, '13:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000001-0001-0005-0001-000000000003', '11111111-1111-1111-1111-111111111111', 5, '16:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0005-0001-000000000003', '22222222-2222-2222-2222-222222222222', 5, '18:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0005-0001-000000000004', '22222222-2222-2222-2222-222222222222', 5, '19:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),

  -- ============================================================================
  -- Saturday (day 6): All Peak - 07:30, 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 19:30
  -- ============================================================================
  ('a0000002-0002-0006-0001-000000000001', '22222222-2222-2222-2222-222222222222', 6, '07:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000002', '22222222-2222-2222-2222-222222222222', 6, '09:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000003', '22222222-2222-2222-2222-222222222222', 6, '10:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000004', '22222222-2222-2222-2222-222222222222', 6, '12:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000005', '22222222-2222-2222-2222-222222222222', 6, '13:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000006', '22222222-2222-2222-2222-222222222222', 6, '15:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000007', '22222222-2222-2222-2222-222222222222', 6, '16:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000008', '22222222-2222-2222-2222-222222222222', 6, '18:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0006-0001-000000000009', '22222222-2222-2222-2222-222222222222', 6, '19:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),

  -- ============================================================================
  -- Sunday (day 0): All Peak - 07:30, 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 19:30
  -- ============================================================================
  ('a0000002-0002-0000-0001-000000000001', '22222222-2222-2222-2222-222222222222', 0, '07:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000002', '22222222-2222-2222-2222-222222222222', 0, '09:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000003', '22222222-2222-2222-2222-222222222222', 0, '10:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000004', '22222222-2222-2222-2222-222222222222', 0, '12:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000005', '22222222-2222-2222-2222-222222222222', 0, '13:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000006', '22222222-2222-2222-2222-222222222222', 0, '15:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000007', '22222222-2222-2222-2222-222222222222', 0, '16:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000008', '22222222-2222-2222-2222-222222222222', 0, '18:00', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4'),
  ('a0000002-0002-0000-0001-000000000009', '22222222-2222-2222-2222-222222222222', 0, '19:30', true, 'org_2wzj16iQknhJygxeSYnYoOX2MO4');

-- ============================================================================
-- SESSION INSTANCES (sample bookable slots for the next few days)
-- All sessions are 75 minutes
-- ============================================================================
INSERT INTO public.session_instances (
  id,
  organization_id,
  template_id,
  start_time,
  end_time,
  status
)
VALUES
  -- ============================================================================
  -- Day +1: Tuesday-like schedule (Off-Peak + Concessions)
  -- ============================================================================
  (
    'b0000001-0001-0001-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '1 day' + TIME '12:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '1 day' + TIME '13:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000003-0003-0001-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '33333333-3333-3333-3333-333333333333',
    (CURRENT_DATE + INTERVAL '1 day' + TIME '15:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '1 day' + TIME '16:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0001-0001-000000000002',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '1 day' + TIME '16:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '1 day' + TIME '17:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0001-0001-000000000003',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '1 day' + TIME '18:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '1 day' + TIME '19:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0001-0001-000000000004',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '1 day' + TIME '19:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '1 day' + TIME '20:45')::timestamptz,
    'scheduled'
  ),

  -- ============================================================================
  -- Day +2: Thursday-like schedule (Peak + Off-Peak + Concessions)
  -- ============================================================================
  (
    'b0000002-0002-0002-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '07:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '08:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0002-0001-000000000002',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '09:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '10:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0002-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '10:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '11:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0002-0001-000000000002',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '12:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '13:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000003-0003-0002-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '33333333-3333-3333-3333-333333333333',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '13:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '14:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0002-0001-000000000003',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '16:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '17:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0002-0001-000000000003',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '18:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '19:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0002-0001-000000000004',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '2 days' + TIME '19:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '2 days' + TIME '20:45')::timestamptz,
    'scheduled'
  ),

  -- ============================================================================
  -- Day +3: Weekend-like schedule (all Peak, 9 sessions)
  -- ============================================================================
  (
    'b0000002-0002-0003-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '07:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '08:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000002',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '09:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '10:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000003',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '10:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '11:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000004',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '12:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '13:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000005',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '13:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '14:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000006',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '15:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '16:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000007',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '16:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '17:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000008',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '18:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '19:15')::timestamptz,
    'scheduled'
  ),
  (
    'b0000002-0002-0003-0001-000000000009',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '22222222-2222-2222-2222-222222222222',
    (CURRENT_DATE + INTERVAL '3 days' + TIME '19:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '3 days' + TIME '20:45')::timestamptz,
    'scheduled'
  ),

  -- ============================================================================
  -- Day +4: Monday (Friends & Family only)
  -- ============================================================================
  (
    'b0000004-0004-0004-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '44444444-4444-4444-4444-444444444444',
    (CURRENT_DATE + INTERVAL '4 days' + TIME '15:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '4 days' + TIME '16:15')::timestamptz,
    'scheduled'
  ),

  -- ============================================================================
  -- Day +5: Weekday sessions (Off-Peak + Concessions)
  -- ============================================================================
  (
    'b0000001-0001-0005-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '5 days' + TIME '10:30')::timestamptz,
    (CURRENT_DATE + INTERVAL '5 days' + TIME '11:45')::timestamptz,
    'scheduled'
  ),
  (
    'b0000001-0001-0005-0001-000000000002',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    '11111111-1111-1111-1111-111111111111',
    (CURRENT_DATE + INTERVAL '5 days' + TIME '12:00')::timestamptz,
    (CURRENT_DATE + INTERVAL '5 days' + TIME '13:15')::timestamptz,
    'scheduled'
  );

-- ============================================================================
-- SAMPLE BOOKINGS
-- 10 full-capacity bookings (16 spots = sold out) + 5 partial bookings
-- ============================================================================
INSERT INTO public.bookings (
  id,
  organization_id,
  session_instance_id,
  user_id,
  status,
  number_of_spots,
  notes,
  payment_status,
  amount_paid,
  unit_price
)
VALUES
  -- ============================================================================
  -- FULL CAPACITY BOOKINGS (16 spots each = sold out)
  -- ============================================================================
  -- Sarah: Off-Peak +1d 12:00 (16 × £10 = £160)
  (
    'c0000001-0001-0001-0001-000000000001',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000001-0001-0001-0001-000000000001',
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'confirmed',
    16,
    'Group booking for yoga club',
    'completed',
    16000,
    1000
  ),
  -- Tom: Concessions +1d 15:00 (16 × £5 = £80)
  (
    'c0000001-0001-0001-0001-000000000002',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000003-0003-0001-0001-000000000001',
    '6a598075-2aa2-5d5f-c88b-fef783f338fe',
    'confirmed',
    16,
    'Community group outing',
    'completed',
    8000,
    500
  ),
  -- Wil: Off-Peak +1d 16:30 (16 × £10 = £160)
  (
    'c0000001-0001-0001-0001-000000000003',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000001-0001-0001-0001-000000000002',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'confirmed',
    16,
    'Corporate event',
    'completed',
    16000,
    1000
  ),
  -- Sarah: Peak +2d 07:30 (16 × £15 = £240)
  (
    'c0000001-0001-0001-0001-000000000004',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0002-0001-000000000001',
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'confirmed',
    16,
    'Birthday party group',
    'completed',
    24000,
    1500
  ),
  -- Tom: Peak +2d 09:00 (16 × £15 = £240)
  (
    'c0000001-0001-0001-0001-000000000005',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0002-0001-000000000002',
    '6a598075-2aa2-5d5f-c88b-fef783f338fe',
    'confirmed',
    16,
    'Running club recovery session',
    'completed',
    24000,
    1500
  ),
  -- Sarah: Off-Peak +2d 10:30 (16 × £10 = £160)
  (
    'c0000001-0001-0001-0001-000000000006',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000001-0001-0002-0001-000000000001',
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'confirmed',
    16,
    'Hen party',
    'completed',
    16000,
    1000
  ),
  -- Tom: Peak +3d 07:30 (16 × £15 = £240)
  (
    'c0000001-0001-0001-0001-000000000007',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0003-0001-000000000001',
    '6a598075-2aa2-5d5f-c88b-fef783f338fe',
    'confirmed',
    16,
    'Rugby team booking',
    'completed',
    24000,
    1500
  ),
  -- Wil: Peak +3d 09:00 (16 × £15 = £240)
  (
    'c0000001-0001-0001-0001-000000000008',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0003-0001-000000000002',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'confirmed',
    16,
    'Team building event',
    'completed',
    24000,
    1500
  ),
  -- Sarah: Peak +3d 10:30 (16 × £15 = £240)
  (
    'c0000001-0001-0001-0001-000000000009',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0003-0001-000000000003',
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'confirmed',
    16,
    'Wellness retreat group',
    'completed',
    24000,
    1500
  ),
  -- Tom: Peak +3d 12:00 (16 × £15 = £240)
  (
    'c0000001-0001-0001-0001-000000000010',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0003-0001-000000000004',
    '6a598075-2aa2-5d5f-c88b-fef783f338fe',
    'confirmed',
    16,
    'Charity event group',
    'completed',
    24000,
    1500
  ),

  -- ============================================================================
  -- PARTIAL BOOKINGS
  -- ============================================================================
  -- Wil: Off-Peak +1d 18:00 (2 spots × £10 = £20)
  (
    'c0000001-0001-0001-0001-000000000011',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000001-0001-0001-0001-000000000003',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'confirmed',
    2,
    'Bringing a friend',
    'completed',
    2000,
    1000
  ),
  -- Sarah: Off-Peak +1d 19:30 (1 spot × £10 = £10)
  (
    'c0000001-0001-0001-0001-000000000012',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000001-0001-0001-0001-000000000004',
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'confirmed',
    1,
    NULL,
    'completed',
    1000,
    1000
  ),
  -- Tom: Off-Peak +2d 12:00 (3 spots × £10 = £30)
  (
    'c0000001-0001-0001-0001-000000000013',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000001-0001-0002-0001-000000000002',
    '6a598075-2aa2-5d5f-c88b-fef783f338fe',
    'confirmed',
    3,
    'Family booking',
    'completed',
    3000,
    1000
  ),
  -- Wil: Peak +2d 18:00 (4 spots × £15 = £60)
  (
    'c0000001-0001-0001-0001-000000000014',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000002-0002-0002-0001-000000000003',
    '4e376853-0880-4b3e-a669-edf561e116dc',
    'confirmed',
    4,
    'Friends outing',
    'completed',
    6000,
    1500
  ),
  -- Sarah: Friends & Family +4d 15:00 (6 spots, free)
  (
    'c0000001-0001-0001-0001-000000000015',
    'org_2wzj16iQknhJygxeSYnYoOX2MO4',
    'b0000004-0004-0004-0001-000000000001',
    '5f487964-1991-4c4f-b77a-fef672f227ed',
    'confirmed',
    6,
    'Family get-together',
    'not_required',
    0,
    0
  );

-- ============================================================================
-- Schedule Summary:
--   Mon: Friends & Family at 15:00 (hidden, free)
--   Tue: Off-Peak 12:00, Concessions 15:00, Off-Peak 16:30, 18:00, 19:30
--   Wed: Peak 12:00, Concessions 15:00, Peak 16:30, 18:00, 19:30
--   Thu: Peak 07:30, 09:00 | Off-Peak 10:30, 12:00, 16:30 | Concessions 13:30 | Peak 18:00, 19:30
--   Fri: Peak 07:30, 09:00 | Off-Peak 10:30, 12:00, 16:30 | Concessions 13:30 | Peak 18:00, 19:30
--   Sat: Peak 07:30, 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 19:30
--   Sun: Peak 07:30, 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 19:30
--
-- Booking Summary:
--   10 bookings at full capacity (16 spots = sold out)
--   5 bookings with partial spots (1-6 spots)
--
-- Run `supabase db reset` to apply this seed locally
-- ============================================================================
