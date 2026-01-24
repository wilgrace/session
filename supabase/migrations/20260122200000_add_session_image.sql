-- Add image_url column to session_templates table
ALTER TABLE "session_templates" ADD COLUMN IF NOT EXISTS "image_url" text;

COMMENT ON COLUMN "session_templates"."image_url" IS 'Optional image URL for the session';
