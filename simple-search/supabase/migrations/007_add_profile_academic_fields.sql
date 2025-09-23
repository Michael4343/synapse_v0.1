-- Add academic profile fields to the profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS orcid_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS academic_website TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bibliography_file_url TEXT;

-- Add comments for clarity
COMMENT ON COLUMN public.profiles.orcid_id IS 'User ORCID identifier for academic research identity';
COMMENT ON COLUMN public.profiles.academic_website IS 'User academic or personal website URL';
COMMENT ON COLUMN public.profiles.bibliography_file_url IS 'URL reference to uploaded bibliography file (future feature)';