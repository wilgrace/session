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

# Restore the backup
psql -d "$CONNECTION_STRING" -f "$BACKUP_FILE" 2>&1 | grep -v "already exists" | grep -v "constraint" || true

echo ""
echo "Restoration complete!"
echo ""
echo "Note: Some 'already exists' errors are expected and can be ignored."
echo ""
echo "Next steps:"
echo "1. Verify your data in Supabase Studio"
echo "2. Update environment variables in Vercel"
echo "3. Deploy Edge Functions to the new project"
echo "4. Test your application"

