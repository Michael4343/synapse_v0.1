-- Add keywords and profile_type columns to submitted_urls table
ALTER TABLE public.submitted_urls 
ADD COLUMN keywords TEXT,
ADD COLUMN profile_type TEXT;
-- Make URL nullable to support keywords-only entries
ALTER TABLE public.submitted_urls 
ALTER COLUMN url DROP NOT NULL;
-- Add index for profile_type for better query performance
CREATE INDEX idx_submitted_urls_profile_type ON public.submitted_urls(profile_type);
