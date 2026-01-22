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
│   │   │   ├── [sessionId]/          # /{slug}/{sessionId} - Session details
│   │   │   ├── checkout/             # /{slug}/checkout - Stripe checkout
│   │   │   └── confirmation/         # /{slug}/confirmation - Booking confirmed
│   │   └── admin/        # Admin dashboard (protected)
│   │       ├── home/                 # /{slug}/admin/home - Bookings view
│   │       ├── sessions/             # /{slug}/admin/sessions - Manage sessions
│   │       ├── billing/              # /{slug}/admin/billing - Stripe Connect
│   │       └── users/                # /{slug}/admin/users - User management
│   ├── actions/          # Server actions (session.ts, clerk.ts, stripe.ts)
│   └── api/              # API routes (webhooks)
├── components/
│   ├── ui/               # Shadcn UI primitives
│   ├── booking/          # Booking components
│   └── admin/            # Admin components
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
- `/{slug}/admin` - Admin dashboard
- `/{slug}/admin/sessions` - Manage sessions
- `/{slug}/admin/billing` - Stripe Connect settings

The middleware validates the slug against the database and sets `x-organization-id` and `x-organization-slug` headers for server components.

## Database Schema (7 Tables)

1. **organizations** - Multi-tenant support (has `slug` column for URL routing)
2. **clerk_users** - User profiles (bridges Clerk ↔ Supabase)
3. **session_templates** - Master templates (recurring or one-off)
4. **session_schedules** - Days/times for recurring sessions
5. **session_instances** - Individual bookable time slots (UTC)
6. **bookings** - User reservations
7. **stripe_connect_accounts** - Stripe Connect account links per organization

### Key Relationships
- Templates have many Schedules → generates Instances
- Users create Bookings for Instances
- All entities scoped to Organizations via `organization_id`

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

### Timezone Handling
- Templates store timezone (default: Europe/London)
- Schedules store local time only (e.g., "14:00")
- Instances stored in UTC
- Display converts back to template timezone

### Authentication Flow
1. User signs up via Clerk
2. Webhook calls `clerk-webhook-handler` Edge Function
3. Function creates `clerk_users` entry in Supabase
4. Middleware routes by role: admin → `/{slug}/admin`, user → `/{slug}`

### Session Generation
1. Admin creates template with schedules
2. `generate-instances` Edge Function triggered
3. Function generates instances for each schedule × recurrence period
4. Instances stored in UTC for booking

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
- **Admin Dashboard**: http://localhost:3000/{org-slug}/admin
- **Supabase API**: http://127.0.0.1:54321
- **Supabase Studio**: http://127.0.0.1:54323
- **Database**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Troubleshooting

**Cannot connect to Supabase**: Ensure Docker Desktop is running, then `supabase start`

**Sessions not generating**: Check template has `is_recurring = true`, schedules exist, and `recurrence_end_date` is in future

**Booking fails**: App auto-generates instances if missing; check template has schedules configured

**Production connection errors**: Verify Vercel env vars use production Supabase URL (not localhost)

**Stripe Connect errors**: For Standard accounts, `createLoginLink` doesn't work - they use dashboard.stripe.com directly

**Invalid slug 404**: Ensure the organization has a `slug` value in the database and it matches the URL

## Related Documentation

- [README.md](README.md) - Setup and running locally
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Database migration procedures
- [src/lib/db/schema.ts](src/lib/db/schema.ts) - Complete database schema
