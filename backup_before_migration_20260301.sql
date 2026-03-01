


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






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE TYPE "public"."membership_status" AS ENUM (
    'none',
    'active',
    'expired',
    'cancelled'
);


ALTER TYPE "public"."membership_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'guest',
    'user',
    'admin',
    'superadmin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_user_to_org_on_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."assign_user_to_org_on_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text") OWNER TO "postgres";


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


ALTER FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_by_slug"("slug_text" "text") RETURNS TABLE("id" "text", "name" "text", "slug" "text", "description" "text", "logo_url" "text")
    LANGUAGE "sql" STABLE PARALLEL SAFE
    AS $$
  SELECT o.id, o.name, o.slug, o.description, o.logo_url
  FROM organizations o
  WHERE o.slug = slug_text
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_organization_by_slug"("slug_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_organization_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."handle_organization_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, NOW());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_instance_generation"("template_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."trigger_instance_generation"("template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text",
    "session_instance_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "number_of_spots" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "booked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_status" "text" DEFAULT 'not_required'::"text",
    "stripe_checkout_session_id" "text",
    "stripe_payment_intent_id" "text",
    "amount_paid" integer,
    "unit_price" integer,
    "discount_amount" integer,
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"]))),
    CONSTRAINT "valid_status" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bookings"."unit_price" IS 'First person price in pence at time of booking';



COMMENT ON COLUMN "public"."bookings"."discount_amount" IS 'Discount applied in pence (from coupon)';



CREATE TABLE IF NOT EXISTS "public"."clerk_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "gender" "text",
    "ethnicity" "text",
    "home_postal_code" "text",
    "clerk_user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "public"."user_role" DEFAULT 'admin'::"public"."user_role" NOT NULL,
    "work_situation" "text",
    "housing_situation" "text",
    "lives_in_cardiff" boolean,
    "cardiff_neighbourhood" "text",
    "birth_year" integer
);


ALTER TABLE "public"."clerk_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clerk_users"."work_situation" IS 'User work situation: full-time, part-time, student, self-employed, looking-for-work, caregiver, prefer-not-to-say';



COMMENT ON COLUMN "public"."clerk_users"."housing_situation" IS 'User housing situation: renting, homeowner-mortgage, homeowner-outright, social-housing, prefer-not-to-say';



COMMENT ON COLUMN "public"."clerk_users"."lives_in_cardiff" IS 'Whether user lives in Cardiff';



COMMENT ON COLUMN "public"."clerk_users"."cardiff_neighbourhood" IS 'Cardiff neighbourhood if lives_in_cardiff is true';



COMMENT ON COLUMN "public"."clerk_users"."birth_year" IS 'Year the user was born (4-digit year)';



CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "price" integer DEFAULT 0 NOT NULL,
    "billing_period" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "member_price_type" "text" DEFAULT 'discount'::"text" NOT NULL,
    "member_discount_percent" integer,
    "member_fixed_price" integer,
    "display_to_non_members" boolean DEFAULT true NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "show_on_booking_page" boolean DEFAULT true NOT NULL,
    "show_on_membership_page" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


COMMENT ON TABLE "public"."memberships" IS 'Membership tiers that organizations can offer';



COMMENT ON COLUMN "public"."memberships"."price" IS 'Membership price in pence. 0 = free membership';



COMMENT ON COLUMN "public"."memberships"."billing_period" IS 'How often the membership is billed: monthly, yearly, or one_time';



COMMENT ON COLUMN "public"."memberships"."display_to_non_members" IS 'If false, only users with this membership can see it (for private invites)';



COMMENT ON COLUMN "public"."memberships"."stripe_product_id" IS 'Stripe Product ID on Connected Account (null for free memberships)';



COMMENT ON COLUMN "public"."memberships"."stripe_price_id" IS 'Stripe Price ID on Connected Account (null for free memberships)';



CREATE TABLE IF NOT EXISTS "public"."org_email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "content" "text" NOT NULL,
    "reply_to" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."org_email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text" DEFAULT ''::"text" NOT NULL,
    "member_price_type" "text" DEFAULT 'discount'::"text",
    "member_discount_percent" integer,
    "member_fixed_price" integer,
    "favicon_url" "text",
    "header_image_url" "text",
    "default_session_image_url" "text",
    "button_color" "text" DEFAULT '#6c47ff'::"text",
    "button_text_color" "text" DEFAULT '#ffffff'::"text",
    "homepage_url" "text",
    "instagram_url" "text",
    "facebook_url" "text",
    "community_survey_enabled" boolean DEFAULT true NOT NULL,
    "default_dropin_price" integer,
    "notification_from_email" "text"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."favicon_url" IS 'URL to custom favicon image';



COMMENT ON COLUMN "public"."organizations"."header_image_url" IS 'URL to header banner image (1600x300, 16:3 aspect ratio)';



COMMENT ON COLUMN "public"."organizations"."default_session_image_url" IS 'URL to default session image (4:3 aspect ratio)';



COMMENT ON COLUMN "public"."organizations"."button_color" IS 'Primary button background color in hex format';



COMMENT ON COLUMN "public"."organizations"."button_text_color" IS 'Primary button text color in hex format';



CREATE TABLE IF NOT EXISTS "public"."session_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text",
    "template_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clerk_user_id" "text"
);


ALTER TABLE "public"."session_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_membership_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_template_id" "uuid" NOT NULL,
    "membership_id" "uuid" NOT NULL,
    "override_price" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."session_membership_prices" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_membership_prices" IS 'Per-membership price overrides for sessions';



COMMENT ON COLUMN "public"."session_membership_prices"."override_price" IS 'Override price in pence for this membership on this session';



CREATE TABLE IF NOT EXISTS "public"."session_one_off_dates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "organization_id" "text",
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "duration_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."session_one_off_dates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_template_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "time" time without time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "organization_id" "text",
    "duration_minutes" integer,
    CONSTRAINT "recurring_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."session_schedules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."session_schedules"."duration_minutes" IS 'Optional per-schedule duration override; falls back to template duration_minutes if null';



CREATE TABLE IF NOT EXISTS "public"."session_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "capacity" integer NOT NULL,
    "duration_minutes" integer NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_start_date" "date",
    "recurrence_end_date" "date",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "pricing_type" "text" DEFAULT 'free'::"text" NOT NULL,
    "drop_in_price" integer,
    "booking_instructions" "text",
    "image_url" "text",
    "member_price" integer,
    "event_color" "text" DEFAULT '#3b82f6'::"text",
    "visibility" "text" DEFAULT 'open'::"text" NOT NULL,
    "drop_in_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "session_templates_pricing_type_check" CHECK (("pricing_type" = ANY (ARRAY['free'::"text", 'paid'::"text"]))),
    CONSTRAINT "session_templates_visibility_check" CHECK (("visibility" = ANY (ARRAY['open'::"text", 'hidden'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."session_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."session_templates"."image_url" IS 'Optional image URL for the session';



COMMENT ON COLUMN "public"."session_templates"."event_color" IS 'Hex color for calendar event display';



COMMENT ON COLUMN "public"."session_templates"."visibility" IS 'Session visibility: open (public), hidden (direct link only), closed (not bookable)';



CREATE TABLE IF NOT EXISTS "public"."stripe_connect_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "stripe_account_id" "text" NOT NULL,
    "account_type" "text" DEFAULT 'standard'::"text" NOT NULL,
    "details_submitted" boolean DEFAULT false NOT NULL,
    "charges_enabled" boolean DEFAULT false NOT NULL,
    "payouts_enabled" boolean DEFAULT false NOT NULL,
    "country" "text" DEFAULT 'GB'::"text",
    "default_currency" "text" DEFAULT 'gbp'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "membership_product_id" "text",
    "membership_price_id" "text",
    "membership_monthly_price" integer
);


ALTER TABLE "public"."stripe_connect_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stripe_connect_accounts"."membership_product_id" IS 'Stripe Product ID for monthly membership on the Connected Account';



COMMENT ON COLUMN "public"."stripe_connect_accounts"."membership_price_id" IS 'Stripe recurring Price ID for monthly membership on the Connected Account';



COMMENT ON COLUMN "public"."stripe_connect_accounts"."membership_monthly_price" IS 'Monthly membership price in pence (cached from Stripe)';



CREATE TABLE IF NOT EXISTS "public"."user_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "text" NOT NULL,
    "status" "public"."membership_status" DEFAULT 'none'::"public"."membership_status" NOT NULL,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    "membership_id" "uuid"
);


ALTER TABLE "public"."user_memberships" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_memberships"."cancelled_at" IS 'Timestamp when user requested cancellation (may still be active until period end)';



COMMENT ON COLUMN "public"."user_memberships"."membership_id" IS 'Reference to the specific membership tier';



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


ALTER TABLE "public"."waiver_agreements" OWNER TO "postgres";


COMMENT ON TABLE "public"."waiver_agreements" IS 'Audit trail of user waiver acknowledgments';



COMMENT ON COLUMN "public"."waiver_agreements"."waiver_version" IS 'Version of the waiver that was agreed to';



COMMENT ON COLUMN "public"."waiver_agreements"."signature_data" IS 'Base64 encoded PNG of signature (for signature type only)';



COMMENT ON COLUMN "public"."waiver_agreements"."ip_address" IS 'IP address of user at time of agreement';



COMMENT ON COLUMN "public"."waiver_agreements"."user_agent" IS 'Browser user agent at time of agreement';



CREATE TABLE IF NOT EXISTS "public"."waivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text",
    "content" "text" NOT NULL,
    "agreement_type" "text" DEFAULT 'checkbox'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waivers" OWNER TO "postgres";


COMMENT ON TABLE "public"."waivers" IS 'Waiver/agreement templates that organizations can require users to acknowledge';



COMMENT ON COLUMN "public"."waivers"."agreement_type" IS 'How users agree: checkbox (tick box) or signature (drawn signature)';



COMMENT ON COLUMN "public"."waivers"."version" IS 'Version number, incremented when content changes significantly';



COMMENT ON COLUMN "public"."waivers"."is_active" IS 'Only one waiver can be active per organization at a time';



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_email_templates"
    ADD CONSTRAINT "org_email_templates_org_type_unique" UNIQUE ("organization_id", "type");



ALTER TABLE ONLY "public"."org_email_templates"
    ADD CONSTRAINT "org_email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."session_instances"
    ADD CONSTRAINT "session_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_membership_prices"
    ADD CONSTRAINT "session_membership_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_membership_prices"
    ADD CONSTRAINT "session_membership_prices_session_template_id_membership_id_key" UNIQUE ("session_template_id", "membership_id");



ALTER TABLE ONLY "public"."session_one_off_dates"
    ADD CONSTRAINT "session_one_off_dates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_schedules"
    ADD CONSTRAINT "session_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_templates"
    ADD CONSTRAINT "session_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_user_org_unique" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."clerk_users"
    ADD CONSTRAINT "users_clerk_user_id_key" UNIQUE ("clerk_user_id");



ALTER TABLE ONLY "public"."clerk_users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."clerk_users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waiver_agreements"
    ADD CONSTRAINT "waiver_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waivers"
    ADD CONSTRAINT "waivers_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "bookings_session_instance_id_user_id_key" ON "public"."bookings" USING "btree" ("session_instance_id", "user_id");



CREATE INDEX "idx_bookings_active_instance" ON "public"."bookings" USING "btree" ("session_instance_id", "user_id") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "idx_bookings_checkout_session" ON "public"."bookings" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_bookings_payment_intent" ON "public"."bookings" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "idx_bookings_payment_status" ON "public"."bookings" USING "btree" ("payment_status");



CREATE INDEX "idx_bookings_pending_payment" ON "public"."bookings" USING "btree" ("status", "booked_at") WHERE ("status" = 'pending_payment'::"text");



CREATE INDEX "idx_bookings_session_instance" ON "public"."bookings" USING "btree" ("session_instance_id");



CREATE INDEX "idx_bookings_session_instance_id" ON "public"."bookings" USING "btree" ("session_instance_id");



CREATE INDEX "idx_bookings_user_id" ON "public"."bookings" USING "btree" ("user_id");



CREATE INDEX "idx_bookings_user_status_updated" ON "public"."bookings" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "idx_clerk_users_clerk_user_id" ON "public"."clerk_users" USING "btree" ("clerk_user_id");



CREATE INDEX "idx_clerk_users_organization" ON "public"."clerk_users" USING "btree" ("organization_id");



CREATE INDEX "idx_memberships_active" ON "public"."memberships" USING "btree" ("organization_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_memberships_organization" ON "public"."memberships" USING "btree" ("organization_id");



CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_session_instances_organization" ON "public"."session_instances" USING "btree" ("organization_id");



CREATE INDEX "idx_session_instances_template_start_time" ON "public"."session_instances" USING "btree" ("template_id", "start_time");



CREATE INDEX "idx_session_membership_prices_membership" ON "public"."session_membership_prices" USING "btree" ("membership_id");



CREATE INDEX "idx_session_membership_prices_template" ON "public"."session_membership_prices" USING "btree" ("session_template_id");



CREATE INDEX "idx_session_schedules_day_time" ON "public"."session_schedules" USING "btree" ("day_of_week", "time");



CREATE INDEX "idx_session_schedules_template_day" ON "public"."session_schedules" USING "btree" ("session_template_id", "day_of_week");



CREATE INDEX "idx_session_schedules_template_id" ON "public"."session_schedules" USING "btree" ("session_template_id");



CREATE INDEX "idx_session_templates_org_created" ON "public"."session_templates" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_session_templates_visibility" ON "public"."session_templates" USING "btree" ("visibility");



CREATE INDEX "idx_stripe_account_id" ON "public"."stripe_connect_accounts" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_stripe_connect_org" ON "public"."stripe_connect_accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_user_memberships_customer" ON "public"."user_memberships" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_user_memberships_membership" ON "public"."user_memberships" USING "btree" ("membership_id");



CREATE INDEX "idx_user_memberships_org_id" ON "public"."user_memberships" USING "btree" ("organization_id");



CREATE INDEX "idx_user_memberships_status" ON "public"."user_memberships" USING "btree" ("status");



CREATE INDEX "idx_user_memberships_subscription" ON "public"."user_memberships" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "idx_user_memberships_user_id" ON "public"."user_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_waiver_agreements_user" ON "public"."waiver_agreements" USING "btree" ("user_id");



CREATE INDEX "idx_waiver_agreements_user_waiver" ON "public"."waiver_agreements" USING "btree" ("user_id", "waiver_id");



CREATE INDEX "idx_waiver_agreements_waiver" ON "public"."waiver_agreements" USING "btree" ("waiver_id");



CREATE INDEX "idx_waivers_org_active" ON "public"."waivers" USING "btree" ("organization_id", "is_active");



CREATE INDEX "idx_waivers_organization" ON "public"."waivers" USING "btree" ("organization_id");



CREATE OR REPLACE TRIGGER "notify_bookings" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://wzurdmzwxqeabvsgqntm.supabase.co/functions/v1/booking-alerts', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6dXJkbXp3eHFlYWJ2c2dxbnRtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE1MzkwNCwiZXhwIjoyMDgxNzI5OTA0fQ.t4j7vvA5luWdH7Ah9qrj55CZR7VO-wFtfMcGqc1bfmg"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "on_bookings_update" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_organization_change" AFTER INSERT OR UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_organization_change"();



CREATE OR REPLACE TRIGGER "on_session_instances_update" BEFORE UPDATE ON "public"."session_instances" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_session_schedules_update" BEFORE UPDATE ON "public"."session_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_session_templates_update" BEFORE UPDATE ON "public"."session_templates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_user_memberships_update" BEFORE UPDATE ON "public"."user_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_waivers_update" BEFORE UPDATE ON "public"."waivers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_memberships_updated_at" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_session_membership_prices_updated_at" BEFORE UPDATE ON "public"."session_membership_prices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_session_one_off_dates_updated_at" BEFORE UPDATE ON "public"."session_one_off_dates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stripe_connect_accounts_updated_at" BEFORE UPDATE ON "public"."stripe_connect_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_waivers_updated_at" BEFORE UPDATE ON "public"."waivers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_session_instance_id_fkey" FOREIGN KEY ("session_instance_id") REFERENCES "public"."session_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."clerk_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clerk_users"
    ADD CONSTRAINT "clerk_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_email_templates"
    ADD CONSTRAINT "org_email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_instances"
    ADD CONSTRAINT "session_instances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_instances"
    ADD CONSTRAINT "session_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."session_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_membership_prices"
    ADD CONSTRAINT "session_membership_prices_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_membership_prices"
    ADD CONSTRAINT "session_membership_prices_session_template_id_fkey" FOREIGN KEY ("session_template_id") REFERENCES "public"."session_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_one_off_dates"
    ADD CONSTRAINT "session_one_off_dates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."session_one_off_dates"
    ADD CONSTRAINT "session_one_off_dates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."session_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_schedules"
    ADD CONSTRAINT "session_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."session_schedules"
    ADD CONSTRAINT "session_schedules_session_template_id_fkey" FOREIGN KEY ("session_template_id") REFERENCES "public"."session_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_templates"
    ADD CONSTRAINT "session_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."clerk_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_templates"
    ADD CONSTRAINT "session_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_connect_accounts"
    ADD CONSTRAINT "stripe_connect_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."clerk_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waiver_agreements"
    ADD CONSTRAINT "waiver_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."clerk_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waiver_agreements"
    ADD CONSTRAINT "waiver_agreements_waiver_id_fkey" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waivers"
    ADD CONSTRAINT "waivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete bookings for their session instances" ON "public"."bookings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."session_instances"
     JOIN "public"."session_templates" ON (("session_templates"."id" = "session_instances"."template_id")))
  WHERE (("session_instances"."id" = "bookings"."session_instance_id") AND ("session_templates"."created_by" IN ( SELECT "clerk_users"."id"
           FROM "public"."clerk_users"
          WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))))));



CREATE POLICY "Admins can manage email templates" ON "public"."org_email_templates" TO "authenticated" USING (("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))) WITH CHECK (("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text")));



CREATE POLICY "Admins can manage instances of their own templates" ON "public"."session_instances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."session_templates"
  WHERE (("session_templates"."id" = "session_instances"."template_id") AND ("session_templates"."created_by" IN ( SELECT "clerk_users"."id"
           FROM "public"."clerk_users"
          WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))))));



CREATE POLICY "Admins can manage one_off_dates" ON "public"."session_one_off_dates" USING (("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))) WITH CHECK (("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text")));



CREATE POLICY "Admins can manage org memberships" ON "public"."user_memberships" USING ((EXISTS ( SELECT 1
   FROM "public"."clerk_users" "cu"
  WHERE (("cu"."clerk_user_id" = ("auth"."uid"())::"text") AND (("cu"."role" = 'superadmin'::"public"."user_role") OR (("cu"."role" = 'admin'::"public"."user_role") AND ("cu"."organization_id" = "user_memberships"."organization_id"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clerk_users" "cu"
  WHERE (("cu"."clerk_user_id" = ("auth"."uid"())::"text") AND (("cu"."role" = 'superadmin'::"public"."user_role") OR (("cu"."role" = 'admin'::"public"."user_role") AND ("cu"."organization_id" = "user_memberships"."organization_id")))))));



CREATE POLICY "Admins can manage schedules for their own templates" ON "public"."session_schedules" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."session_templates" "st"
     JOIN "public"."clerk_users" "cu" ON (("st"."created_by" = "cu"."id")))
  WHERE (("st"."id" = "session_schedules"."session_template_id") AND ("cu"."clerk_user_id" = ("auth"."uid"())::"text")))));



CREATE POLICY "Admins can read users in their organization" ON "public"."clerk_users" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "clerk_users_1"."organization_id"
   FROM "public"."clerk_users" "clerk_users_1"
  WHERE ("clerk_users_1"."clerk_user_id" = ("auth"."uid"())::"text"))));



CREATE POLICY "Allow authenticated users to manage their own bookings" ON "public"."bookings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clerk_users" "cu"
  WHERE (("cu"."id" = "bookings"."user_id") AND ("cu"."clerk_user_id" = ("auth"."uid"())::"text")))));



CREATE POLICY "Allow authenticated users to read session_templates" ON "public"."session_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can read active waivers" ON "public"."waivers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can read organization public info" ON "public"."organizations" FOR SELECT USING (true);



CREATE POLICY "Anyone can view session membership prices" ON "public"."session_membership_prices" FOR SELECT USING (true);



CREATE POLICY "Anyone can view visible active memberships" ON "public"."memberships" FOR SELECT USING ((("is_active" = true) AND ("display_to_non_members" = true)));



CREATE POLICY "Debug: Allow viewing all bookings" ON "public"."bookings" FOR SELECT USING (true);



CREATE POLICY "Enable insert for authenticated users" ON "public"."session_templates" FOR INSERT TO "authenticated" WITH CHECK (("created_by" IN ( SELECT "clerk_users"."id"
   FROM "public"."clerk_users"
  WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text"))));



CREATE POLICY "Enable update for users based on created_by" ON "public"."session_templates" FOR UPDATE TO "authenticated" USING (("created_by" IN ( SELECT "clerk_users"."id"
   FROM "public"."clerk_users"
  WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))) WITH CHECK (("created_by" IN ( SELECT "clerk_users"."id"
   FROM "public"."clerk_users"
  WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text"))));



CREATE POLICY "Organization admins can manage their organization" ON "public"."organizations" TO "authenticated" USING (((("auth"."jwt"() ->> 'org_role'::"text") = 'org:admin'::"text") AND ("id" = ("auth"."jwt"() ->> 'org_id'::"text"))));



CREATE POLICY "Organization admins can manage their organization's bookings" ON "public"."bookings" TO "authenticated" USING (((("auth"."jwt"() ->> 'org_role'::"text") = 'org:admin'::"text") AND ("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))));



CREATE POLICY "Organization admins can manage their organization's clerk users" ON "public"."clerk_users" TO "authenticated" USING (((("auth"."jwt"() ->> 'org_role'::"text") = 'org:admin'::"text") AND ("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))));



CREATE POLICY "Organization admins can manage their organization's session ins" ON "public"."session_instances" TO "authenticated" USING (((("auth"."jwt"() ->> 'org_role'::"text") = 'org:admin'::"text") AND ("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))));



CREATE POLICY "Organization admins can manage their organization's session sch" ON "public"."session_schedules" TO "authenticated" USING (((("auth"."jwt"() ->> 'org_role'::"text") = 'org:admin'::"text") AND ("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))));



CREATE POLICY "Organization admins can manage their organization's session tem" ON "public"."session_templates" TO "authenticated" USING (((("auth"."jwt"() ->> 'org_role'::"text") = 'org:admin'::"text") AND ("organization_id" = ("auth"."jwt"() ->> 'org_id'::"text"))));



CREATE POLICY "Public can read one_off_dates" ON "public"."session_one_off_dates" FOR SELECT USING (true);



CREATE POLICY "Service role bypass" ON "public"."session_one_off_dates" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access" ON "public"."stripe_connect_accounts" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to waiver_agreements" ON "public"."waiver_agreements" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to waivers" ON "public"."waivers" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to memberships" ON "public"."memberships" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to session membership prices" ON "public"."session_membership_prices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Super admins can manage all bookings" ON "public"."bookings" TO "authenticated" USING ((("auth"."jwt"() ->> 'org_role'::"text") = 'org:super_admin'::"text"));



CREATE POLICY "Super admins can manage all clerk users" ON "public"."clerk_users" TO "authenticated" USING ((("auth"."jwt"() ->> 'org_role'::"text") = 'org:super_admin'::"text"));



CREATE POLICY "Super admins can manage all organizations" ON "public"."organizations" TO "authenticated" USING ((("auth"."jwt"() ->> 'org_role'::"text") = 'org:super_admin'::"text"));



CREATE POLICY "Super admins can manage all session instances" ON "public"."session_instances" TO "authenticated" USING ((("auth"."jwt"() ->> 'org_role'::"text") = 'org:super_admin'::"text"));



CREATE POLICY "Super admins can manage all session schedules" ON "public"."session_schedules" TO "authenticated" USING ((("auth"."jwt"() ->> 'org_role'::"text") = 'org:super_admin'::"text"));



CREATE POLICY "Super admins can manage all session templates" ON "public"."session_templates" TO "authenticated" USING ((("auth"."jwt"() ->> 'org_role'::"text") = 'org:super_admin'::"text"));



CREATE POLICY "Users can create their own bookings" ON "public"."bookings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clerk_users"
  WHERE (("clerk_users"."id" = "bookings"."user_id") AND ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))));



CREATE POLICY "Users can delete their own bookings" ON "public"."bookings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."clerk_users"
  WHERE (("clerk_users"."id" = "bookings"."user_id") AND ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))));



CREATE POLICY "Users can insert their own bookings" ON "public"."bookings" FOR INSERT WITH CHECK (("user_id" IN ( SELECT "clerk_users"."id"
   FROM "public"."clerk_users"
  WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can manage session instances for their templates" ON "public"."session_instances" USING (("template_id" IN ( SELECT "session_templates"."id"
   FROM "public"."session_templates"
  WHERE (("session_templates"."created_by")::"text" = ("auth"."uid"())::"text")))) WITH CHECK (("template_id" IN ( SELECT "session_templates"."id"
   FROM "public"."session_templates"
  WHERE (("session_templates"."created_by")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can manage their own session schedules" ON "public"."session_schedules" USING (("session_template_id" IN ( SELECT "session_templates"."id"
   FROM "public"."session_templates"
  WHERE (("session_templates"."created_by")::"text" = ("auth"."uid"())::"text")))) WITH CHECK (("session_template_id" IN ( SELECT "session_templates"."id"
   FROM "public"."session_templates"
  WHERE (("session_templates"."created_by")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can manage their own session templates" ON "public"."session_templates" USING ((("created_by")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("created_by")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can read own memberships" ON "public"."user_memberships" FOR SELECT USING (("user_id" IN ( SELECT "clerk_users"."id"
   FROM "public"."clerk_users"
  WHERE ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can read their own clerk user record" ON "public"."clerk_users" FOR SELECT TO "authenticated" USING (("clerk_user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can read their own organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clerk_users"
  WHERE (("clerk_users"."organization_id" = "organizations"."id") AND ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))));



CREATE POLICY "Users can update their own bookings" ON "public"."bookings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."clerk_users"
  WHERE (("clerk_users"."id" = "bookings"."user_id") AND ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))));



CREATE POLICY "Users can view session instances" ON "public"."session_instances" FOR SELECT USING (true);



CREATE POLICY "Users can view session schedules" ON "public"."session_schedules" FOR SELECT USING (true);



CREATE POLICY "Users can view session templates" ON "public"."session_templates" FOR SELECT USING (true);



CREATE POLICY "Users can view their own bookings" ON "public"."bookings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clerk_users"
  WHERE (("clerk_users"."id" = "bookings"."user_id") AND ("clerk_users"."clerk_user_id" = ("auth"."uid"())::"text")))));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clerk_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_membership_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_one_off_dates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_connect_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waiver_agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waivers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";












GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";







































SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






















































































































































































































































SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;

































SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;















GRANT ALL ON FUNCTION "public"."assign_user_to_org_on_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_user_to_org_on_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_user_to_org_on_create"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_clerk_user"("p_clerk_user_id" "text", "p_email" "text", "p_first_name" "text", "p_last_name" "text", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_by_slug"("slug_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_by_slug"("slug_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_by_slug"("slug_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_organization_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_organization_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_organization_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_instance_generation"("template_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_instance_generation"("template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_instance_generation"("template_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;


















GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."clerk_users" TO "anon";
GRANT ALL ON TABLE "public"."clerk_users" TO "authenticated";
GRANT ALL ON TABLE "public"."clerk_users" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."org_email_templates" TO "anon";
GRANT ALL ON TABLE "public"."org_email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."org_email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."session_instances" TO "anon";
GRANT ALL ON TABLE "public"."session_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."session_instances" TO "service_role";



GRANT ALL ON TABLE "public"."session_membership_prices" TO "anon";
GRANT ALL ON TABLE "public"."session_membership_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."session_membership_prices" TO "service_role";



GRANT ALL ON TABLE "public"."session_one_off_dates" TO "anon";
GRANT ALL ON TABLE "public"."session_one_off_dates" TO "authenticated";
GRANT ALL ON TABLE "public"."session_one_off_dates" TO "service_role";



GRANT ALL ON TABLE "public"."session_schedules" TO "anon";
GRANT ALL ON TABLE "public"."session_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."session_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."session_templates" TO "anon";
GRANT ALL ON TABLE "public"."session_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."session_templates" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "anon";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_connect_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."user_memberships" TO "anon";
GRANT ALL ON TABLE "public"."user_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."user_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."waiver_agreements" TO "anon";
GRANT ALL ON TABLE "public"."waiver_agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."waiver_agreements" TO "service_role";



GRANT ALL ON TABLE "public"."waivers" TO "anon";
GRANT ALL ON TABLE "public"."waivers" TO "authenticated";
GRANT ALL ON TABLE "public"."waivers" TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































