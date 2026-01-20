# CLAUDE.md - Sawna Session Booking System

## Project Overview

**Sawna** is a session booking system built with Next.js and Supabase. It manages booking of time-based sessions (originally designed for sauna bookings) with support for recurring sessions, user management, and role-based access control.

## Tech Stack

- **Frontend**: Next.js 15.3 (App Router), React 18, TailwindCSS, Radix UI, Zustand
- **Backend**: Supabase (PostgreSQL 15), Drizzle ORM, Deno Edge Functions
- **Auth**: Clerk (JWT-based, synced to Supabase via webhook)
- **Key Libraries**: react-big-calendar, react-hook-form, zod, date-fns

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Sign-in/sign-up pages
│   ├── admin/            # Admin dashboard (protected)
│   ├── booking/          # Public booking pages
│   ├── actions/          # Server actions (session.ts, clerk.ts)
│   └── api/              # API routes (webhooks, users)
├── components/
│   ├── ui/               # Shadcn UI primitives
│   ├── booking/          # Booking components
│   └── admin/            # Admin components
├── lib/
│   ├── db/
│   │   ├── schema.ts     # Drizzle ORM schema (7 tables)
│   │   └── queries.ts    # Database queries
│   ├── supabase.ts       # Supabase client
│   └── *-utils.ts        # Utility functions
└── types/                # TypeScript definitions

supabase/
├── migrations/           # 28+ SQL migrations
├── functions/            # Edge Functions
│   ├── generate-instances/      # Creates bookable slots
│   └── clerk-webhook-handler/   # Syncs Clerk users
└── config.toml           # Local Supabase config
```

## Database Schema (6 Tables)

1. **organizations** - Multi-tenant support
2. **clerk_users** - User profiles (bridges Clerk ↔ Supabase)
3. **session_templates** - Master templates (recurring or one-off)
4. **session_schedules** - Days/times for recurring sessions
5. **session_instances** - Individual bookable time slots (UTC)
6. **bookings** - User reservations

### Key Relationships
- Templates have many Schedules → generates Instances
- Users create Bookings for Instances
- All entities scoped to Organizations

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

## Key Patterns

### Server Actions
All database operations use React 19 server actions in `src/app/actions/`:
- `getPublicSessions()` - Fetch bookable instances
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
4. Middleware routes by role: admin → `/admin`, user → `/booking`

### Session Generation
1. Admin creates template with schedules
2. `generate-instances` Edge Function triggered
3. Function generates instances for each schedule × recurrence period
4. Instances stored in UTC for booking

## RLS & Authorization

- All tables have Row-Level Security enabled
- Clerk roles: `org:super_admin`, `org:admin`, `org:user`
- Admins manage sessions and view all bookings
- Users only see public sessions and their own bookings
- Service role key bypasses all RLS (use for admin operations)

## Local Development URLs

- **App**: http://localhost:3000
- **Supabase API**: http://127.0.0.1:54321
- **Supabase Studio**: http://127.0.0.1:54323
- **Database**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Troubleshooting

**Cannot connect to Supabase**: Ensure Docker Desktop is running, then `supabase start`

**Sessions not generating**: Check template has `is_recurring = true`, schedules exist, and `recurrence_end_date` is in future

**Booking fails**: App auto-generates instances if missing; check template has schedules configured

**Production connection errors**: Verify Vercel env vars use production Supabase URL (not localhost)

## Related Documentation

- [README.md](README.md) - Setup and running locally
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Database migration procedures
- [src/lib/db/schema.ts](src/lib/db/schema.ts) - Complete database schema
