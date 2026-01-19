# Supabase Migration Checklist

Use this checklist to ensure you complete all steps for migrating to a new Supabase project.

## Pre-Migration

- [ ] Download backup from paused Supabase project
- [ ] Verify backup file is accessible (`.backup` or `.gz` format)
- [ ] Ensure `psql` is installed and version 15+ (`psql --version`)

## Create New Project

- [ ] Create new Supabase project at https://supabase.com/dashboard
- [ ] Save the database password securely
- [ ] Wait for project to be fully provisioned (2-3 minutes)
- [ ] Note the project reference ID (from URL or Settings)

## Restore Database

- [ ] Unzip backup file if it's `.gz` format
- [ ] Get connection string from new project (Settings → Database)
- [ ] Replace `[YOUR-PASSWORD]` in connection string
- [ ] Run restore command or use `./scripts/restore-backup.sh`
- [ ] Verify restoration completed (ignore "already exists" errors)
- [ ] Check Supabase Studio to verify tables and data exist

## Get API Keys

- [ ] Go to Settings → API in new project
- [ ] Copy Project URL
- [ ] Copy anon/public key
- [ ] Copy service_role key (secret)

## Deploy Edge Functions

- [ ] Link Supabase project: `supabase link --project-ref [PROJECT-REF]`
- [ ] Deploy `generate-instances` function
- [ ] Deploy `clerk-webhook-handler` function
- [ ] Verify functions appear in Supabase dashboard

## Update Vercel Environment Variables

- [ ] Go to Vercel project → Settings → Environment Variables
- [ ] Update `NEXT_PUBLIC_SUPABASE_URL` (new project URL)
- [ ] Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` (new anon key)
- [ ] Update `SUPABASE_SERVICE_ROLE_KEY` (new service_role key)
- [ ] Set variables for Production, Preview, and Development
- [ ] Trigger new deployment

## Verify Migration

- [ ] Visit Vercel deployment URL
- [ ] Test `/booking` page loads
- [ ] Verify sessions appear in calendar
- [ ] Test creating a booking (if applicable)
- [ ] Check admin pages work correctly
- [ ] Verify Edge Functions are working (check logs)

## Post-Migration

- [ ] Update local `.env.local` if needed
- [ ] Document new project details
- [ ] Test all critical features
- [ ] Monitor error logs for 24-48 hours

## If Issues Occur

- [ ] Check Vercel deployment logs
- [ ] Check Supabase function logs
- [ ] Verify environment variables are set correctly
- [ ] Check database connection in Supabase Studio
- [ ] Review MIGRATION_GUIDE.md troubleshooting section


