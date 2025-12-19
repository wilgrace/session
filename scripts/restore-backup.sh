#!/bin/bash

# Supabase Backup Restoration Script
# Usage: ./scripts/restore-backup.sh [backup-file] [connection-string]

set -e

BACKUP_FILE=$1
CONNECTION_STRING=$2

if [ -z "$BACKUP_FILE" ] || [ -z "$CONNECTION_STRING" ]; then
  echo "Usage: ./scripts/restore-backup.sh [backup-file] [connection-string]"
  echo ""
  echo "Example:"
  echo "  ./scripts/restore-backup.sh ./backup_20250609_130805.sql \"postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres\""
  exit 1
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Check if file is gzipped
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "Detected gzipped backup, extracting..."
  EXTRACTED_FILE="${BACKUP_FILE%.gz}"
  gunzip -k "$BACKUP_FILE"
  BACKUP_FILE="$EXTRACTED_FILE"
  echo "Extracted to: $BACKUP_FILE"
fi

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo "Error: psql is not installed"
  echo "Install with: brew install postgresql@15"
  exit 1
fi

echo "Starting backup restoration..."
echo "Backup file: $BACKUP_FILE"
echo "Target: [connection string hidden]"
echo ""

# Test connection first
echo "Testing database connection..."
if ! psql -d "$CONNECTION_STRING" -c "SELECT 1;" > /dev/null 2>&1; then
  echo ""
  echo "ERROR: Failed to connect to database!"
  echo ""
  echo "Common issues:"
  echo "1. Project reference in connection string is incorrect"
  echo "2. Database password is incorrect"
  echo "3. Connection string format is wrong"
  echo ""
  echo "To get the correct connection string:"
  echo "1. Go to your Supabase project dashboard"
  echo "2. Settings → Database → Connection string"
  echo "3. Use the 'Session pooler' connection string"
  echo "4. Replace [YOUR-PASSWORD] with your actual database password"
  echo ""
  echo "Connection string format should be:"
  echo "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
  exit 1
fi

echo "Connection successful!"
echo ""

# Restore the backup
echo "Restoring backup (this may take a few minutes)..."
RESTORE_OUTPUT=$(psql -d "$CONNECTION_STRING" -f "$BACKUP_FILE" 2>&1)
RESTORE_EXIT_CODE=$?

# Filter out expected errors but keep actual failures
echo "$RESTORE_OUTPUT" | grep -v "already exists" | grep -v "constraint" | grep -v "already exists" || true

if [ $RESTORE_EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✓ Restoration completed successfully!"
  echo ""
  echo "Note: Some 'already exists' errors are expected and can be ignored."
  echo ""
  echo "Next steps:"
  echo "1. Verify your data in Supabase Studio (Table Editor)"
  echo "2. Update environment variables in Vercel"
  echo "3. Deploy Edge Functions to the new project"
  echo "4. Test your application"
else
  echo ""
  echo "⚠ Restoration completed with some errors (exit code: $RESTORE_EXIT_CODE)"
  echo "Check the output above for details."
  echo "Many errors are expected (like 'already exists') and can be ignored."
  echo ""
  echo "Verify your data in Supabase Studio to confirm restoration was successful."
fi

