This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

Before running the app locally, ensure you have:

- **Node.js** (v18 or higher)
- **Docker Desktop** (required for local Supabase development)
- **Supabase CLI** (installed via npm: `npm install -g supabase`)

## Getting Started

### 1. Start Docker Desktop

Supabase requires Docker to run locally. Make sure Docker Desktop is running before proceeding.

### 2. Start Supabase

In the project root, start the local Supabase instance:

```bash
supabase start
```

This will:
- Start all Supabase services (PostgreSQL, API, Auth, Storage, etc.)
- Run database migrations
- Seed the database (if seed files exist)

**Important URLs** (displayed after `supabase start`):
- **Supabase Studio** (Database UI): http://127.0.0.1:54323
- **API URL**: http://127.0.0.1:54321
- **Database URL**: postgresql://postgres:postgres@127.0.0.1:54322/postgres

### 3. Set Up Environment Variables

Create a `.env.local` file in the project root with:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

You can get these keys by running `supabase status` after starting Supabase.

### 4. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Viewing the Database

### Supabase Studio

The easiest way to view and manage your database is through Supabase Studio:

1. Start Supabase: `supabase start`
2. Open http://127.0.0.1:54323 in your browser
3. Navigate to the "Table Editor" to view and edit data
4. Use the "SQL Editor" to run custom queries

### Check Supabase Status

To see all service URLs and connection details:

```bash
supabase status
```

## Session Instance Generation

### How It Works

The app uses a **session instance generation system** to create bookable time slots from recurring session templates.

#### Key Concepts

1. **Session Templates**: Define the structure of a session (name, duration, capacity, etc.)
2. **Session Schedules**: Define when sessions occur (day of week, time)
3. **Session Instances**: Individual bookable time slots created from templates and schedules

#### Instance Generation Logic

The `generate-instances` function creates instances based on:

- **Start Date**: Uses `recurrence_start_date` from the template, or today if not set
- **End Date**: Uses `recurrence_end_date` from the template, or 3 months from today if not set
- **Schedules**: Generates instances for each day/time combination in the template's schedules
- **Timezone**: Converts local times to UTC using the configured timezone (default: Europe/London)

**Important**: If `recurrence_end_date` is set (e.g., to September 2024), instances will only be generated up to that date, even if you run the function later.

#### When Instances Are Generated

1. **Automatically on template creation**: When a recurring template is created, instances are generated automatically
2. **On-demand when viewing calendar**: When users visit `/booking`, the app checks if instances exist for the next 3 months and generates them if missing
3. **Manually**: You can trigger generation manually (see below)

### Running the Generate-Instances Function

#### Option 1: Automatic (Recommended)

Instances are automatically generated when:
- A recurring session template is created
- Users visit the booking calendar (`/booking`) and instances are missing

#### Option 2: Manual via API

**Using curl:**

```bash
curl -X POST http://localhost:54321/functions/v1/generate-instances \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-service-role-key>" \
  -d '{"template_id_to_process": "YOUR_TEMPLATE_ID_HERE"}'
```

Replace `YOUR_TEMPLATE_ID_HERE` with an actual template ID from your database.

**Get a template ID:**
1. Open Supabase Studio: http://127.0.0.1:54323
2. Go to the `session_templates` table
3. Copy an ID from there

#### Option 3: Serve Function Locally

To run the function with live reloading:

```bash
# Serve just the generate-instances function
supabase functions serve generate-instances --no-verify-jwt

# Or serve all functions
supabase functions serve --no-verify-jwt
```

Then call it at: `http://localhost:54321/functions/v1/generate-instances`

### Troubleshooting Instance Generation

#### Instances Stop at a Certain Date

If instances only go up to September (or another date), check:

1. **Check `recurrence_end_date` in the template:**
   ```sql
   SELECT id, name, recurrence_end_date FROM session_templates;
   ```

2. **Update the end date:**
   ```sql
   UPDATE session_templates 
   SET recurrence_end_date = '2026-12-31' 
   WHERE recurrence_end_date = '2024-09-30';
   ```

3. **Or set it to NULL for unlimited generation:**
   ```sql
   UPDATE session_templates 
   SET recurrence_end_date = NULL 
   WHERE id = 'your-template-id';
   ```

4. **Re-run the generate-instances function** for that template

#### No Instances Being Created

1. **Check if the template has schedules:**
   ```sql
   SELECT * FROM session_schedules WHERE session_template_id = 'your-template-id';
   ```

2. **Verify the template is recurring:**
   ```sql
   SELECT is_recurring FROM session_templates WHERE id = 'your-template-id';
   ```

3. **Check function logs:**
   - If running locally, check the terminal where `supabase functions serve` is running
   - Look for error messages about timezone conversion or database queries

#### Instances Not Showing in Calendar

1. **Check if instances exist:**
   ```sql
   SELECT COUNT(*) FROM session_instances 
   WHERE template_id = 'your-template-id' 
   AND start_time >= NOW();
   ```

2. **Verify instances are in the future:**
   - The booking calendar only shows future instances
   - Check `start_time` values are after the current date/time

3. **Check instance status:**
   ```sql
   SELECT status FROM session_instances WHERE template_id = 'your-template-id';
   ```
   - Only instances with `status = 'scheduled'` are shown

## Common Issues

### "TypeError: fetch failed" or "Cannot connect to Supabase"

**Problem**: Docker Desktop is not running or Supabase is not started.

**Solution**:
1. Start Docker Desktop
2. Run `supabase start`
3. Wait for all services to be ready
4. Verify with `supabase status`

### "Missing Supabase environment variables"

**Problem**: `.env.local` file is missing or incomplete.

**Solution**:
1. Create `.env.local` in the project root
2. Add the required environment variables (see "Set Up Environment Variables" above)
3. Get the keys from `supabase status`

### Booking Fails with "Failed to find session instance"

**Problem**: The instance doesn't exist for the selected time slot.

**Solution**: The app now automatically creates instances when booking if they don't exist. If this still fails:
1. Check if the template has schedules
2. Verify the time slot matches the schedule
3. Check Supabase logs for errors

## Project Structure

```
session/
├── src/
│   ├── app/
│   │   ├── actions/
│   │   │   └── session.ts          # Server actions for sessions/bookings
│   │   ├── booking/                 # Public booking pages
│   │   └── admin/                   # Admin pages
│   ├── components/
│   │   ├── booking/                 # Booking UI components
│   │   └── admin/                   # Admin UI components
│   └── lib/
│       ├── supabase.ts              # Supabase client setup
│       └── db/                      # Database schema and queries
├── supabase/
│   ├── functions/
│   │   └── generate-instances/     # Edge function for instance generation
│   ├── migrations/                  # Database migrations
│   └── config.toml                  # Supabase configuration
└── README.md
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Supabase Documentation](https://supabase.com/docs) - learn about Supabase features and local development.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
