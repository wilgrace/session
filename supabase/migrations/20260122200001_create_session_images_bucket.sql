-- Create storage bucket for session images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-images',
  'session-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to session-images bucket
CREATE POLICY "Authenticated users can upload session images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'session-images');

-- Allow public read access to session images
CREATE POLICY "Public read access to session images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'session-images');

-- Allow authenticated users to delete their own images
CREATE POLICY "Authenticated users can delete session images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'session-images');
