# CLAUDE.md - Sawna Session Booking System

## Project Overview

**Sawna** is a multi-tenant session booking system built with Next.js and Supabase. It manages booking of time-based sessions (originally designed for sauna bookings) with support for recurring sessions, user management, and role-based access control.

## Tech Stack

- **Frontend**: Next.js 15.3 (App Router), React 18, TailwindCSS, Radix UI, Zustand
- **Backend**: Supabase (PostgreSQL 15), Drizzle ORM, Deno Edge Functions
- **Auth**: Clerk (JWT-based, synced to Supabase via webhook)
- **Payments**: Stripe Connect (Standard accounts)
- **Key Libraries**: react-big-calendar, react-hook-form, zod, date-fns, stripe

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Sign-in/sign-up pages
│   ├── [slug]/           # Multi-tenant routes (org-specific)
│   │   ├── (booking)/    # Public booking pages
│   │   │   ├── page.tsx              # /{slug} - Booking calendar
│   │   │   ├── [sessionId]/          # /{slug}/{sessionId} - Session details (unified template)
│   │   │   ├── checkout/             # /{slug}/checkout - Stripe checkout
│   │   │   └── confirmation/         # /{slug}/confirmation - Redirects to session page
│   │   ├── account/      # User account management
│   │   │   └── page.tsx              # /{slug}/account - Membership & billing history
│   │   └── admin/        # Admin dashboard (protected)
│   │       ├── home/                 # /{slug}/admin/home - Bookings view
│   │       ├── sessions/             # /{slug}/admin/sessions - Manage sessions
│   │       ├── billing/              # /{slug}/admin/billing - Stripe Connect
│   │       └── users/                # /{slug}/admin/users - User management
│   ├── actions/          # Server actions (session.ts, clerk.ts, stripe.ts)
│   └── api/              # API routes (webhooks)
├── components/
│   ├── ui/               # Shadcn UI primitives
│   ├── auth/             # Auth overlay components
│   ├── booking/          # Booking components
│   └── admin/            # Admin components
├── hooks/
│   ├── use-auth-overlay.ts   # Zustand store for auth overlay state
│   ├── use-mobile.tsx        # Mobile detection hook
│   └── use-toast.ts          # Toast notifications
├── lib/
│   ├── db/
│   │   ├── schema.ts     # Drizzle ORM schema (7 tables)
│   │   └── queries.ts    # Database queries
│   ├── supabase.ts       # Supabase client
│   ├── site-config.ts    # Environment-aware URL config
│   ├── tenant-utils.ts   # Multi-tenant utilities
│   ├── slug-context.tsx  # React context for slug
│   └── *-utils.ts        # Other utility functions
└── types/                # TypeScript definitions

supabase/
├── migrations/           # SQL migrations
├── functions/            # Edge Functions
│   ├── generate-instances/      # Creates bookable slots
│   └── clerk-webhook-handler/   # Syncs Clerk users
└── config.toml           # Local Supabase config
```

## Multi-Tenant URL Structure

All booking and admin routes are prefixed with the organization's slug:

- `/{slug}` - Public booking calendar
- `/{slug}/{sessionId}` - Book a specific session
- `/{slug}/account` - User account (membership status, billing history)
- `/{slug}/admin` - Admin dashboard
- `/{slug}/admin/sessions` - Manage sessions
- `/{slug}/admin/billing` - Stripe Connect settings

The middleware validates the slug against the database and sets `x-organization-id` and `x-organization-slug` headers for server components.

## Database Schema (9 Tables)

1. **organizations** - Multi-tenant support (has `slug` column for URL routing)
2. **clerk_users** - User profiles (bridges Clerk ↔ Supabase, includes `date_of_birth`, `gender`, `ethnicity` for community profile)
3. **user_memberships** - User subscription status per organization
4. **saunas** - Sauna/facility definitions (legacy, may be unused)
5. **session_templates** - Master templates, includes `event_color` for calendar display. Whether a template is recurring/one-off is **derived** from child records (not stored); `deleted_at` for soft-delete
6. **session_schedules** - Days/times for recurring schedules, includes optional `duration_minutes` override and `ended_at` to stop a recurring schedule on a date
7. **session_instances** - Individual bookable time slots (UTC), stores `start_time`, `end_time`, `status` (`active`/`cancelled`), `schedule_id`, and instance-level override columns (`name_override`, `description_override`, `pricing_type_override`, etc.)
8. **bookings** - User reservations (includes `price_paid`, `member_price_applied` for price tracking, `cancelled_at`, `cancelled_by_user_id`, `cancellation_reason`, `refund_amount`)
9. **stripe_connect_accounts** - Stripe Connect account links per organization (includes membership product/price IDs)

### Key Relationships
- Templates have many Schedules → generates Instances; Templates can also have one-off dates
- Users create Bookings for Instances
- All entities scoped to Organizations via `organization_id`

### Mixed Schedule Types
A single template can have **both** recurring schedules and one-off dates simultaneously. The `is_recurring` boolean column was removed from `session_templates` in migration `20260228000002`. Whether a template is recurring is now **derived**:
- Recurring: `schedules.length > 0`
- One-off: `one_off_dates.length > 0`
- Mixed: both non-empty (fully supported)

**Critical**: Never add back `is_recurring` to `session_templates`. All code that previously branched on `template.is_recurring` now uses `(template.schedules?.length ?? 0) > 0`.

### Session Duration Hierarchy
Duration can be set at different levels with inheritance:
1. **Schedule-level** (`session_schedules.duration_minutes`) - Highest priority, optional
2. **Template-level** (`session_templates.duration_minutes`) - Default fallback

When generating instances, the Edge Function uses: `schedule.duration_minutes || template.duration_minutes`

## Common Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)
supabase start           # Start local Supabase (requires Docker)
supabase status          # Get local URLs and keys

# Database
npm run db:generate      # Generate Drizzle migrations
npm run db:push          # Push migrations to Supabase
npm run db:studio        # Open Drizzle Studio

# Deployment
./scripts/deploy-functions.sh [PROJECT-REF]   # Deploy Edge Functions
./scripts/test-connection.sh                   # Test connectivity

# Database Sync (Local ↔ Remote)
supabase db diff --linked           # Check differences between local and remote
supabase db push --linked           # Push local migrations to remote
supabase db reset                   # Reset local DB to match migrations
```

## Local Development Startup

Run these in separate terminal windows:

```bash
# Terminal 1: Database & Edge Functions
supabase start

# Terminal 2: Next.js App
npm run dev

# Terminal 3: Stripe webhooks (copy whsec_... to STRIPE_WEBHOOK_SECRET)
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --forward-connect-to localhost:3000/api/webhooks/stripe

# Terminal 4: Clerk webhooks (only needed when testing user sync)
ngrok http 54321
# Then update Clerk dashboard webhook URL to: https://<ngrok-id>.ngrok.io/api/webhooks/clerk
```

**What each does**:
- `supabase start` - Runs PostgreSQL, Auth, and Edge Functions (including `clerk-webhook-handler`)
- `npm run dev` - Next.js on port 3000
- `stripe listen` - Forwards Stripe webhooks to localhost (the `--forward-connect-to` flag is needed for Connected Account events like subscriptions)
- `ngrok http 54321
` - Tunnels port 3000 so Clerk can send webhooks to your local machine

**Note**: Clerk webhooks go to your Next.js app (port 3000), not directly to Supabase. The Edge Function is called via Supabase's internal routing.

## Database Sync Workflow

Keep local and remote Supabase databases in sync with this workflow:

### Before pushing to git (after schema changes)
```bash
# 1. Generate migration if you made Drizzle schema changes
npm run db:generate

# 2. Check what differs between local migrations and remote DB
supabase db diff --linked

# 3. Push new migrations to remote
supabase db push --linked

# 4. Commit and push
git add supabase/migrations/
git commit -m "chore: Add database migration"
git push
```

### After pulling from git (or switching branches)
```bash
# Reset local DB to apply any new migrations
supabase db reset
```

> **Seed file caution**: `supabase db reset` runs migrations first, then executes `supabase/seed.sql` (configured in `config.toml`). If a migration drops a column, that column must also be removed from any `INSERT` statements in `seed.sql`. `CREATE TABLE IF NOT EXISTS` blocks in the seed file are harmless (skipped since the table already exists from migrations) — only fix the `INSERT` statements.

### Syncing remote changes to local
If the remote DB has changes not in your local migrations:
```bash
# 1. Check what's different
supabase db diff --linked

# 2. Create a migration from the diff (if needed)
supabase db diff --linked -f new_migration_name

# 3. Reset local to apply the new migration
supabase db reset
```

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public API key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin API key (bypasses RLS)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `DEFAULT_ORGANIZATION_ID` - Default org for new users
- `STRIPE_SECRET_KEY` - Stripe API secret key (sk_test_... or sk_live_...)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (whsec_...)
- `NEXT_PUBLIC_APP_URL` - App base URL for Stripe redirects (http://localhost:3000 locally)
- `RESEND_API_KEY` - Resend API key for transactional email
- `RESEND_FROM_EMAIL` - Optional override for sender address (default: `notifications@bookasession.org`)

## Key Patterns

### Multi-Tenant Routing
- Middleware detects slug from first path segment
- Validates slug against `organizations` table
- Sets `x-organization-id` and `x-organization-slug` headers
- Server components use `getTenantFromHeaders()` to access context
- Client components use `useParams()` or `useSlug()` hook

### Server Actions
All database operations use React 19 server actions in `src/app/actions/`:
- `getPublicSessionsByOrg(organizationId)` - Fetch bookable instances for an org
- `createBooking()` - Create user booking
- `createSessionTemplate()` - Admin creates template
- `updateCurrentUserProfile()` - Update logged-in user's community profile (dob, gender, ethnicity)

### Timezone Handling
- Templates store timezone (default: Europe/London)
- Schedules store local time (e.g., "14:00") and optional duration override
- Instances stored in UTC with pre-calculated `start_time` and `end_time`
- Display converts back to template timezone
- Calendar views use schedule/template duration when instances aren't yet generated

### Authentication Flow
1. User signs up via Clerk (through Auth Overlay or dedicated pages)
2. Webhook calls `clerk-webhook-handler` Edge Function
3. Function creates `clerk_users` entry in Supabase
4. Middleware routes by role: admin → `/{slug}/admin`, user → `/{slug}`

### Auth Overlay System

All Clerk authentication (sign-in/sign-up) uses a modal overlay instead of page redirects.

**Key Files**:
- `src/hooks/use-auth-overlay.ts` - Zustand store for overlay state
- `src/components/auth/auth-overlay.tsx` - Modal/sheet component with Clerk forms
- `src/components/auth/community-profile-overlay.tsx` - Post-signup demographic form

**Usage Pattern**:
```typescript
const { openSignIn, openSignUp } = useAuthOverlay()

// Open sign-in overlay
openSignIn({ onComplete: () => proceedWithAction() })

// Open sign-up overlay with pre-filled email
openSignUp({
  initialEmail: email,
  onComplete: () => proceedToCheckout(savedFormData)
})
```

**Responsive Behavior**:
- **Mobile**: Bottom sheet (slides up from bottom)
- **Desktop**: Centered modal dialog

**Community Profile Overlay**:
- Shown after sign-up completion
- Optional demographic fields: date of birth, gender, ethnicity
- All fields include "Prefer not to say" option
- Skip button returns to previous flow

### Unified Booking Page

The session detail page (`/{slug}/{sessionId}`) handles all booking states using a unified template:

**Modes** (determined by URL params):
- `mode="new"` - Default, shows PreCheckoutForm → CheckoutStep
- `mode="edit"` - When `?edit=true&bookingId=X`, shows BookingPanel
- `mode="confirmation"` - When `?confirmed=true&bookingId=X`, shows BookingPanel with toast

**Key Components**:
- `BookingForm` - Orchestrates rendering based on mode
- `BookingPanel` - Unified view for edit/confirmation with:
  - Share actions (Copy Link, Add to Calendar)
  - Important information display
  - User details or guest signup callout
  - Inline quantity picker with price summary
  - Update/Cancel booking actions

**Confirmation Flow**:
- `/{slug}/confirmation` page now redirects to `/{slug}/{sessionId}?confirmed=true`
- Session page shows a toast notification on arrival
- Guest users see a callout prompting account creation

### Session Configuration

The Create/Edit Session form (`src/components/admin/session-form.tsx`) is organized into sections:

**General Section**:
- Session Name, Description, Booking Instructions
- Capacity (max participants)
- Session Image (optional)
- Calendar Event Color (hex color picker, default: `#3b82f6` blue)

**Schedule Section**:
- Schedule Type: Repeat (recurring) or Once (one-off) — a template can have both
- Start/End Dates (displayed inline for recurring schedules)
- Time slots with per-schedule Duration (each schedule can have its own duration)

**Payment Section**:
- Pricing Type: Free or Paid
- Drop-in Price (for non-members)
- Membership Pricing overrides

### Session Generation
1. Admin creates template with recurring schedules and/or one-off dates
2. `generate-instances` Edge Function triggered
3. Function generates instances for recurring schedules using schedule-specific duration or template default, and for each one-off date
4. Instances stored in UTC with calculated `start_time` and `end_time`

### Instance Cancellation
Admins can cancel individual session instances from the admin home page.

**Flow**:
1. Admin clicks "Manage" on a session in the daily view → opens `InstancePanel` Sheet
2. Admin clicks "Cancel this session", enters optional reason → confirmation dialog
3. Server action `cancelSessionInstance(instanceId, reason)`:
   - Verifies admin access
   - Fetches all confirmed bookings for the instance
   - Refunds paid bookings via Stripe (issues refund to original payment)
   - Soft-deletes paid bookings (`cancelled_at`, `cancellation_reason`, `refund_amount`); hard-deletes free bookings
   - Sends `session_cancellation` email to each affected user
   - Sets `session_instances.status = 'cancelled'`, records `cancelled_at`, `cancelled_by_user_id`, `cancellation_reason`

**Key Files**:
- `src/components/admin/instance-panel.tsx` — Sheet UI for manage/cancel
- `src/components/admin/session-details.tsx` — Added "Manage" button + "Cancelled" badge
- `src/app/actions/session.ts` — `cancelSessionInstance()` server action

**User-facing**: The booking page (`/{slug}/{sessionId}?start=...`) checks `session.instances[0].status === 'cancelled'` and shows a "This session has been cancelled" message instead of the booking form.

**Email type**: `session_cancellation` — triggers on instance cancellation, one email per affected user.

### Stripe Connect Integration
Organizations connect their Stripe accounts to receive payments for bookings.

**Account Type**: Standard (organizations use their own Stripe Dashboard)

**Key Files**:
- `src/app/actions/stripe.ts` - Server actions for Connect operations
- `src/app/api/webhooks/stripe/route.ts` - Webhook handler for account.updated events
- `src/app/[slug]/admin/billing/page.tsx` - Admin billing UI

**Server Actions**:
- `getStripeConnectStatus()` - Get org's connection status
- `createStripeConnectAccount()` - Create Standard connected account
- `createOnboardingLink()` - Generate Stripe-hosted onboarding URL
- `createDashboardLink()` - Get dashboard URL (stripe.com for Standard accounts)
- `disconnectStripeAccount()` - Remove connection from database

**Onboarding Flow**:
1. Admin clicks "Connect with Stripe" at `/{slug}/admin/billing`
2. Server creates Stripe account and stores in `stripe_connect_accounts`
3. User redirected to Stripe-hosted onboarding
4. On completion, redirected back to `/{slug}/admin/billing?success=true`
5. Webhook updates `details_submitted`, `charges_enabled`, `payouts_enabled`

**Testing Webhooks Locally**:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET
```

### Membership Subscriptions

Organizations can offer monthly memberships that give users discounted session pricing.

**Architecture Decision**: Subscriptions are created on the **Connected Account** (not the Platform). This means:
- The business owns the customer relationship
- Subscriptions appear in the Connected Account's Stripe Dashboard
- Customers can manage billing via the Connected Account's billing portal
- No `transfer_data` is used for subscription checkouts

**Database Tables**:

`user_memberships` - Stores user membership status per organization:
- `user_id`, `organization_id` - Links user to org membership
- `status` - 'none', 'active', or 'cancelled'
- `stripe_subscription_id` - Subscription ID on the Connected Account
- `stripe_customer_id` - Customer ID on the Connected Account
- `current_period_start`, `current_period_end` - Billing period dates
- `cancelled_at` - When user requested cancellation (grace period until `current_period_end`)

`stripe_connect_accounts` - Additional membership fields:
- `membership_product_id` - Stripe Product ID on Connected Account
- `membership_price_id` - Stripe recurring Price ID on Connected Account
- `membership_monthly_price` - Cached price in pence

**Key Files**:
- `src/app/actions/membership.ts` - Membership server actions
- `src/app/actions/checkout.ts` - Hybrid checkout (payment vs subscription mode)
- `src/lib/pricing-utils.ts` - Member price calculation, `isMembershipActive()`
- `src/components/booking/pre-checkout-form.tsx` - Membership selection UI
- `src/components/booking/booking-panel.tsx` - Unified view/edit/confirmation panel
- `src/components/booking/share-actions.tsx` - Copy link & add to calendar buttons
- `src/components/booking/guest-account-callout.tsx` - Guest signup prompt

**Checkout Flow**:

1. **New membership purchase** (`mode: 'subscription'`):
   - Checkout created on Connected Account with `stripeAccount` option
   - Line items: recurring membership price + one-off session price
   - Frontend loads Stripe.js with `stripeAccount` for embedded checkout
   - `connectedAccountId` passed from server to `EmbeddedCheckoutWrapper`

2. **Existing member booking** (`mode: 'payment'`):
   - Standard checkout on Platform with `transfer_data` to Connected Account
   - Member price applied automatically

3. **Drop-in booking** (`mode: 'payment'`):
   - Standard checkout on Platform with `transfer_data`
   - Full drop-in price

**Guest Membership Sign-Up Flow**:

Guests purchasing memberships must create an account first (so the Stripe webhook can link the subscription to a `clerk_users` record). This is handled via the Auth Overlay:

1. Guest selects "Become a Member" and enters email
2. Clicking "Create Account" opens the Auth Overlay (bottom sheet on mobile, dialog on desktop)
3. After sign-up completes, system polls `checkClerkUserSynced()` for webhook sync
4. Community Profile overlay appears (optional demographic questions)
5. After skip/submit, proceeds directly to Stripe checkout

**Key Implementation Details**:
- `pre-checkout-form.tsx` saves form data to `savedFormData` state before opening overlay
- Auth Overlay uses Clerk `<SignUp routing="hash" forceRedirectUrl={currentUrl} />`
- `forceRedirectUrl` is critical - without it, middleware redirects authenticated users to `/{slug}`
- Uses Clerk's authenticated email (not form email) when proceeding to checkout

**Member Pricing Hierarchy**:
1. Session template `member_price` override (highest priority)
2. Organization `member_fixed_price` (if `member_price_type = 'fixed'`)
3. Organization `member_discount_percent` (if `member_price_type = 'discount'`)
4. Fall back to drop-in price (no member discount)

**Grace Period**: When a member cancels, they remain active until `current_period_end`. The `isMembershipActive()` function handles this.

**Testing Connect Webhooks Locally**:
```bash
# For subscription events from Connected Accounts, use --forward-connect-to
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --forward-connect-to localhost:3000/api/webhooks/stripe
```

### User Account Page

The account page (`/{slug}/account`) allows authenticated users to view and manage their membership.

**Features**:
- View membership status (active, cancelled, expired, or none)
- See next billing date or cancellation end date
- Access Stripe billing portal to update payment method or cancel
- View billing history with invoice PDFs

**Key Files**:
- `src/app/[slug]/account/page.tsx` - Server component with auth check
- `src/app/[slug]/account/account-client.tsx` - Client component with membership UI

**Server Actions Used**:
- `getUserMembership(organizationId)` - Get user's membership status
- `getUserBillingHistory(organizationId)` - Fetch payment history from Stripe
- `createBillingPortalSession(organizationId)` - Generate Stripe billing portal URL

### Email Notifications

Transactional emails are sent via the **Resend** SDK. Three email types are supported, each configurable per-org from admin settings.

**Email Types**:
| Type | Trigger |
|------|---------|
| `booking_confirmation` | After paid booking (Stripe webhook `checkout.session.completed`) or free booking (`createDirectBooking`) |
| `membership_confirmation` | After new subscription (Stripe webhook `customer.subscription.created`) |
| `session_cancellation` | When an admin cancels a session instance (`cancelSessionInstance` server action) — one email per affected booking |
| `waiting_list` | Not yet triggered — template exists ready for when the feature ships |

**Key Files**:
- `src/lib/email-html.ts` — Pure HTML builders, **no server deps** — safe to import in client components (used for admin preview). Functions: `renderTemplate`, `buildEmailWrapper`, `buildCtaButton`, `buildOutlineCtaButton`, `buildDetailRow`, `buildBookingConfirmationPreview`, etc.
- `src/lib/email.ts` — Server-only. Resend client, `sendEmail`, `sendBookingConfirmationEmail`, `sendMembershipConfirmationEmail`
- `src/lib/email-defaults.ts` — Default subjects, HTML content, and variable lists for each type. `EMAIL_TEMPLATE_DEFAULTS`, `EMAIL_TEMPLATE_LABELS`, `ALL_EMAIL_TYPES`
- `src/app/actions/email-templates.ts` — Server actions: `getEmailTemplates`, `updateEmailTemplate`, `toggleEmailTemplateActive`, `seedDefaultEmailTemplates`
- `src/components/admin/email-templates-list.tsx` — Admin table UI
- `src/components/admin/email-template-form.tsx` — Edit sheet (subject, HTML content, reply-to, active toggle)
- `src/components/admin/email-template-preview-modal.tsx` — Preview iframe using sample data

**Database**: `org_email_templates` table — one row per org per type, seeded automatically on first load. Unique constraint on `(organization_id, type)`.

**From Address**: Always sent as `{Org Name} <notifications@bookasession.org>`. The `bookasession.org` domain must be verified in Resend (Domains tab). Override the address with `RESEND_FROM_EMAIL` env var if needed. The `notification_from_email` column on `organizations` is no longer used.

**Template Variables**: Content uses `{{variable}}` placeholders substituted at send time via `renderTemplate()`. Per-type available variables are listed in `EMAIL_TEMPLATE_DEFAULTS[type].editableVariables`. Non-editable injected fields (session image, event dot, booking details card, CTA buttons) are always appended in `sendBookingConfirmationEmail`.

**Critical — snake_case mapping**: Supabase returns snake_case column names (`is_active`, `reply_to`, `organization_id`) but `OrgEmailTemplate` from Drizzle `$inferSelect` expects camelCase (`isActive`, `replyTo`, `organizationId`). The `mapTemplate()` function in `email-templates.ts` handles this conversion. **Any new Supabase query returning `org_email_templates` rows must use `mapTemplate()`** — a bare `as OrgEmailTemplate[]` cast will silently break `isActive` and all other camelCase fields.

**Admin UI Location**: Settings page (`/{slug}/admin/settings`) → "Emails" section (above Waivers).

**Idempotency Keys**: `booking-confirmation/{bookingId}`, `membership-confirmation/{subscriptionId}`, `session-cancellation/{instanceId}/{bookingId}` — prevents duplicate sends on webhook retries.

**Error handling**: All email functions catch and log errors but never throw, so webhook/booking flow is never broken by email failures. Check Resend dashboard (resend.com/emails) or server logs for `[sendBookingConfirmationEmail]` / `[sendMembershipConfirmationEmail]` prefixed entries.

## RLS & Authorization

- All tables have Row-Level Security enabled
- Clerk roles: `org:super_admin`, `org:admin`, `org:user`
- Admins manage sessions and view all bookings for their org
- Users only see public sessions and their own bookings
- Service role key bypasses all RLS (use for admin operations)
- Organization-scoped RLS policies filter by `organization_id = auth.jwt() ->> 'org_id'`

## Local Development URLs

- **App**: http://localhost:3000
- **Booking Page**: http://localhost:3000/{org-slug}
- **Account Page**: http://localhost:3000/{org-slug}/account
- **Admin Dashboard**: http://localhost:3000/{org-slug}/admin
- **Supabase API**: http://127.0.0.1:54321
- **Supabase Studio**: http://127.0.0.1:54323
- **Database**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Troubleshooting

**Cannot connect to Supabase**: Ensure Docker Desktop is running, then `supabase start`

**Sessions not generating**: Check that the template has schedules configured and `recurrence_end_date` is in the future (for recurring), or one-off dates exist. The `is_recurring` column no longer exists — it was removed in migration `20260228000002`.

**Booking fails**: App auto-generates instances if missing; check template has schedules configured

**Production connection errors**: Verify Vercel env vars use production Supabase URL (not localhost)

**Stripe Connect errors**: For Standard accounts, `createLoginLink` doesn't work - they use dashboard.stripe.com directly

**Invalid slug 404**: Ensure the organization has a `slug` value in the database and it matches the URL

## Performance Optimizations

These optimisations were deliberately added to improve PageSpeed (mobile ~60→75+) and PWA startup. **Do not revert them** when merging landing page changes or other work.

### Image Delivery (`next.config.ts`)
- `images.formats: ['image/avif', 'image/webp']` — Next.js Image serves AVIF/WebP to supporting browsers. Do not remove this.
- Logo in `src/components/booking/booking-header.tsx` uses `quality={75}` (not 90). Don't raise it without a clear reason.
- Static assets (SVG, ICO, PNG, webmanifest) get `Cache-Control: public, max-age=31536000, immutable` via the `headers()` export in `next.config.ts`.

### Font Loading (`src/app/layout.tsx`)
- Inter is loaded with `display: "swap"` to prevent render-blocking. Keep this.

### Lazy-Loaded Calendars
- The **booking calendar** (`src/components/booking/lazy-booking-calendar.tsx`) is dynamically imported with `ssr: false` — keeps `react-big-calendar` + `moment` (~150 KB) out of the initial bundle.
- The **admin calendar** (`src/components/admin/calendar-page.tsx`) is also dynamically imported using the same pattern. Do not change this back to a static import.

### Org Data Caching (`src/lib/tenant-utils.ts`)
- `getOrganizationBySlug` and `getOrganizationById` use `unstable_cache` (5-minute TTL) on top of React's `cache()`. This caches org metadata across requests in Next.js's Data Cache, avoiding a Supabase round-trip on every page load.
- If org metadata needs to update immediately after an admin change, call `revalidateTag('org-by-id')` or `revalidateTag('org-by-slug')` in the relevant server action.

### PWA Splash Screen & Service Worker (`next.config.ts`, `src/components/splash-warmer.tsx`)
- The workbox `runtimeCaching` array has a `CacheFirst` rule for `/api/og/` URLs **before** the `NetworkOnly` catch-all for `/api/`. This ordering is intentional and critical — it ensures generated splash screens and PWA icons are cached by the service worker. **Never move the `/api/og/` rule below the `/api/` rule.**
- `SplashWarmer` uses `fetch(url, { cache: 'force-cache' })` instead of `new Image()` to reliably populate the SW cache with the iOS splash image on first visit.

### What Was Not Fixed (Infrastructure Limits)
- ~1.5 s document request latency on first load is a Vercel free-tier cold-start issue, not a code problem.
- ~175 KB unused JS is Clerk's SDK, unavoidable with the current auth architecture.

## Landing Page (`public/landing/index.html`)

The landing page is a static Framer export served from `public/landing/`. After every new Framer export, run this full import workflow:

### Import Workflow

**1. Copy the new HTML export:**
```bash
cp "landing-page/Session - Sauna Booking Software.html" public/landing/index.html
```

**2. Copy new asset files:**
```bash
cp "landing-page/Session - Sauna Booking Software_files/"* public/landing/files/
```

**3. Rewrite asset paths** (Framer exports use relative `_files/` paths):
```bash
python3 -c "
import re, pathlib
p = pathlib.Path('public/landing/index.html')
c = p.read_text()
c = re.sub(r'./Session - Sauna Booking Software_files/', '/landing/files/', c)
c = c.replace('src=\"script\"', 'src=\"script.js\"')
p.write_text(c)
"
```

**4. Download Framer CDN `.mjs` dependencies locally** (they are NOT included in the export):
- Extract all `framerusercontent.com/sites/…/*.mjs` URLs from the HTML and from `script_main.*.mjs`
- `curl` each one into `public/landing/files/` using just the filename
- Repeat for any transitive imports inside downloaded files
- Replace all `https://framerusercontent.com/sites/[SITE_ID]/FILENAME.mjs` with `/landing/files/FILENAME.mjs` in both the HTML and all local `.mjs` files

**5. Strip Framer editor UI** (not needed in production — always remove after every export):
```bash
python3 << 'EOF'
import re, pathlib
p = pathlib.Path('public/landing/index.html')
c = p.read_text()
# Remove editorbar detection script in <head>
c = re.sub(r'\s*<script>try\{if\(localStorage\.get\("__framer_force_showing_editorbar_since"\).*?</script>', '', c, flags=re.DOTALL)
# Remove editorbar CSS style block
c = re.sub(r'<style type="text/css" data-framer-css="true"></style><style>\s*#__framer-editorbar.*?</style>(?=</head>)', '<style type="text/css" data-framer-css="true"></style>', c, flags=re.DOTALL)
# Remove editorbar container div, iframe, and its inline script
c = re.sub(r'<div id="__framer-editorbar-container".*?</script>', '', c, flags=re.DOTALL)
p.write_text(c)
print("Editorbar removed. Remaining refs:", c.count('editorbar'))
EOF
```

**6. Re-append the custom Clerk sign-in script** before `</body>` (it is stripped by a fresh export — check git diff to restore it).

**7. Verify:**
```bash
grep -c 'framerusercontent.com/sites' public/landing/index.html   # should be 0
grep -c 'editorbar' public/landing/index.html                     # should be 0
```

## Related Documentation

- [README.md](README.md) - Setup and running locally
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Database migration procedures
- [src/lib/db/schema.ts](src/lib/db/schema.ts) - Complete database schema
