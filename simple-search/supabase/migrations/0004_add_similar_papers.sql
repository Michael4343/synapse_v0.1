-- Add support for storing similar paper crosswalk data and status tracking
ALTER TABLE public.search_results
  ADD COLUMN IF NOT EXISTS similar_papers_status TEXT CHECK (similar_papers_status IN ('pending', 'in_progress', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS similar_papers_data JSONB,
  ADD COLUMN IF NOT EXISTS similar_papers_updated_at TIMESTAMPTZ;

ALTER TABLE public.paper_verification_requests
  ADD COLUMN IF NOT EXISTS similar_papers_data JSONB;
