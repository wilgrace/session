#!/bin/bash

# Test Supabase connection script
# Usage: ./scripts/test-connection.sh [connection-string]

CONNECTION_STRING=$1

if [ -z "$CONNECTION_STRING" ]; then
  echo "Usage: ./scripts/test-connection.sh [connection-string]"
  echo ""
  echo "Example:"
  echo "  ./scripts/test-connection.sh \"postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres\""
  exit 1
fi

echo "Testing connection..."
echo ""

# Try to connect and run a simple query
if psql -d "$CONNECTION_STRING" -c "SELECT version();" 2>&1; then
  echo ""
  echo "✓ Connection successful!"
  echo ""
  echo "Testing database access..."
  psql -d "$CONNECTION_STRING" -c "\dt" 2>&1 | head -20
  echo ""
  echo "If you see tables listed above, the connection is working correctly."
else
  echo ""
  echo "✗ Connection failed!"
  echo ""
  echo "Troubleshooting steps:"
  echo "1. Verify project reference in connection string matches your project URL"
  echo "2. Check that password is correct (case-sensitive, no extra spaces)"
  echo "3. Try direct connection instead of pooler:"
  echo "   postgresql://postgres.[REF]:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
  echo "4. Make sure project is fully provisioned (wait 2-3 minutes after creation)"
  echo "5. Check Supabase dashboard for any network restrictions"
  exit 1
fi


