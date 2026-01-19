#!/bin/bash

# Deploy Edge Functions to Supabase
# Usage: ./scripts/deploy-functions.sh [project-ref]

PROJECT_REF=$1

if [ -z "$PROJECT_REF" ]; then
  echo "Usage: ./scripts/deploy-functions.sh [project-ref]"
  echo ""
  echo "Example:"
  echo "  ./scripts/deploy-functions.sh wzurdmzwxqeabvsgqntm"
  echo ""
  echo "To get your project reference:"
  echo "  - It's in your project URL: https://[PROJECT-REF].supabase.co"
  echo "  - Or in Settings → General → Reference ID"
  exit 1
fi

echo "Linking to Supabase project: $PROJECT_REF"
echo ""

# Link to the project
if supabase link --project-ref "$PROJECT_REF"; then
  echo ""
  echo "✓ Successfully linked to project"
else
  echo ""
  echo "✗ Failed to link to project"
  echo "Make sure you're logged in: supabase login"
  exit 1
fi

echo ""
echo "Deploying Edge Functions..."
echo ""

# Deploy generate-instances function
echo "Deploying generate-instances..."
if supabase functions deploy generate-instances; then
  echo "✓ generate-instances deployed"
else
  echo "✗ Failed to deploy generate-instances"
  exit 1
fi

echo ""

# Deploy clerk-webhook-handler function
echo "Deploying clerk-webhook-handler..."
if supabase functions deploy clerk-webhook-handler; then
  echo "✓ clerk-webhook-handler deployed"
else
  echo "✗ Failed to deploy clerk-webhook-handler"
  exit 1
fi

echo ""
echo "✓ All Edge Functions deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Update environment variables in Vercel"
echo "2. Redeploy your Vercel application"
echo "3. Test your application"


