-- Add short_name column to organizations for PWA home screen display
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS short_name text;
