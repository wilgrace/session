-- Add branding fields to organizations table
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS favicon_url TEXT,
  ADD COLUMN IF NOT EXISTS header_image_url TEXT,
  ADD COLUMN IF NOT EXISTS default_session_image_url TEXT,
  ADD COLUMN IF NOT EXISTS button_color TEXT DEFAULT '#6c47ff',
  ADD COLUMN IF NOT EXISTS button_text_color TEXT DEFAULT '#ffffff';

COMMENT ON COLUMN public.organizations.favicon_url IS 'URL to custom favicon image';
COMMENT ON COLUMN public.organizations.header_image_url IS 'URL to header banner image (1600x300, 16:3 aspect ratio)';
COMMENT ON COLUMN public.organizations.default_session_image_url IS 'URL to default session image (4:3 aspect ratio)';
COMMENT ON COLUMN public.organizations.button_color IS 'Primary button background color in hex format';
COMMENT ON COLUMN public.organizations.button_text_color IS 'Primary button text color in hex format';
