-- Add community profile fields to clerk_users table
ALTER TABLE clerk_users
  ADD COLUMN work_situation TEXT,
  ADD COLUMN housing_situation TEXT,
  ADD COLUMN lives_in_cardiff BOOLEAN,
  ADD COLUMN cardiff_neighbourhood TEXT,
  ADD COLUMN city TEXT;

-- Add comment for documentation
COMMENT ON COLUMN clerk_users.work_situation IS 'User work situation: full-time, part-time, student, self-employed, looking-for-work, caregiver, prefer-not-to-say';
COMMENT ON COLUMN clerk_users.housing_situation IS 'User housing situation: renting, homeowner-mortgage, homeowner-outright, social-housing, prefer-not-to-say';
COMMENT ON COLUMN clerk_users.lives_in_cardiff IS 'Whether user lives in Cardiff';
COMMENT ON COLUMN clerk_users.cardiff_neighbourhood IS 'Cardiff neighbourhood if lives_in_cardiff is true';
COMMENT ON COLUMN clerk_users.city IS 'UK city if lives_in_cardiff is false';
