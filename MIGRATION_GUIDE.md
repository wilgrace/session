# Supabase Project Migration Guide

This guide will help you restore your paused Supabase project to a new project.

## Prerequisites

1. **PostgreSQL and psql installed** (for restoring backups)
   - macOS: `brew install postgresql@15` or `brew install postgresql`
   - Verify: `psql --version` (should be version 15 or higher)

2. **Access to your paused Supabase project** (to download backup)

3. **New Supabase project created** (we'll create this in Step 2)

## Step 1: Download Backup from Paused Project

1. Go to your **paused Supabase project** dashboard: https://supabase.com/dashboard
2. Navigate to **Settings** → **Database** → **Backups**
3. Click **Download** on the most recent backup
4. The backup will be a `.gz` file (gzipped)
5. Save it to your project directory: `/Users/wil/dev/session/`

## Step 2: Create New Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **New Project**
3. Fill in:
   - **Name**: Your project name (e.g., "session-sawna")
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the same region as your old project (if possible)
4. Click **Create new project**
5. Wait for the project to be fully provisioned (2-3 minutes)

## Step 3: Get New Project Connection Details

1. In your **new project dashboard**, go to **Settings** → **Database**
2. Scroll down to **Connection string**
3. Copy the **Session pooler** connection string (it looks like):
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the database password you set in Step 2
5. Save this connection string - you'll need it for restoration

## Step 4: Prepare Backup File

1. If your backup file is `.gz` (gzipped), unzip it:
   ```bash
   cd /Users/wil/dev/session
   gunzip backup_name.gz
   ```
   This will create `backup_name.backup`

2. If you already have a `.backup` file, you can use it directly

## Step 5: Restore Backup to New Project

Run this command (replace with your actual values):

```bash
cd /Users/wil/dev/session
psql -d "postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" -f ./backup_name.backup
```

**Example:**
```bash
psql -d "postgresql://postgres.abcdefghijklmnop:MyPassword123@aws-0-us-east-1.pooler.supabase.com:5432/postgres" -f ./backup_20250609_130805.sql
```

**Note:** You may see errors like "object already exists" - these are expected and can be ignored. The restore will continue.

## Step 6: Get New Project API Keys

1. In your **new project dashboard**, go to **Settings** → **API**
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (secret) (for `SUPABASE_SERVICE_ROLE_KEY`)

## Step 7: Deploy Edge Functions

Your Edge Functions need to be deployed to the new project:

```bash
cd /Users/wil/dev/session

# Link to your new project (you'll need the project reference)
supabase link --project-ref [YOUR-NEW-PROJECT-REF]

# Deploy all functions
supabase functions deploy generate-instances
supabase functions deploy clerk-webhook-handler
```

**To get your project reference:**
- It's in your project URL: `https://[PROJECT-REF].supabase.co`
- Or in Settings → General → Reference ID

## Step 8: Update Environment Variables in Vercel

1. Go to your Vercel project: https://vercel.com/dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Update these variables:

   - `NEXT_PUBLIC_SUPABASE_URL` → Your new project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Your new anon key
   - `SUPABASE_SERVICE_ROLE_KEY` → Your new service_role key

4. **Important:** Make sure to set these for **Production**, **Preview**, and **Development** environments
5. After updating, **redeploy** your application

## Step 9: Verify Migration

1. Check your database in Supabase Studio:
   - Go to **Table Editor** → Verify your tables exist
   - Check that data is present

2. Test your application:
   - Visit your Vercel deployment
   - Try accessing `/booking` page
   - Verify sessions and bookings load correctly

## Troubleshooting

### "psql: error: connection to server... failed: received invalid response to GSSAPI negotiation"
- **Solution:** Update psql to version 15 or higher
- macOS: `brew upgrade postgresql` or `brew install postgresql@15`

### "Wrong password" error
- **Solution:** Wait a few minutes after resetting password, then try again

### "object already exists" errors during restore
- **Solution:** These are expected and can be ignored. The restore will continue.

### Edge Functions not working
- **Solution:** Make sure you've deployed them to the new project (Step 7)
- Check function logs in Supabase dashboard → Edge Functions

### Still seeing connection errors
- **Solution:** 
  1. Verify environment variables are set correctly in Vercel
  2. Make sure you've redeployed after updating variables
  3. Check Vercel deployment logs for specific error messages

## Additional Notes

- **Storage files**: If you have files in Supabase Storage, you'll need to migrate them separately (see Supabase docs)
- **Auth settings**: You may need to reconfigure Auth providers in the new project
- **Realtime**: Realtime settings may need to be reconfigured

## Quick Reference Commands

```bash
# Unzip backup
gunzip backup_name.gz

# Restore backup
psql -d "postgresql://postgres.[REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" -f ./backup_name.backup

# Link Supabase project
supabase link --project-ref [PROJECT-REF]

# Deploy functions
supabase functions deploy generate-instances
supabase functions deploy clerk-webhook-handler
```

