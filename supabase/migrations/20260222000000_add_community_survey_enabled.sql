ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS community_survey_enabled boolean NOT NULL DEFAULT true;
