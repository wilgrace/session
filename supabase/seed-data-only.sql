-- Seed data only (no schema changes) for production database
-- This file contains only INSERT statements from seed.sql

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

-- NOTE: Stripe Connect accounts should be connected through the UI at /{slug}/admin/billing
-- Do not seed fake Stripe account IDs - they won't work with your live Stripe API keys

-- Create sample session templates
INSERT INTO public.session_templates (
  id,
  organization_id,
  name,
  description,
  capacity,
  duration_minutes,
  is_open,
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
  ('00000000-0000-0000-0000-000000000006', '55555555-5555-5555-5555-555555555555', 6, '09:00', true, 'org_bristol_sawna_001'); -- Saturday
