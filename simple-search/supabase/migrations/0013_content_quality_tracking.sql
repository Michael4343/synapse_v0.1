-- Add content quality tracking to search_results table
-- This allows us to distinguish between full papers and abstract-only content

ALTER TABLE public.search_results
ADD COLUMN content_quality TEXT DEFAULT NULL,
ADD COLUMN content_type TEXT DEFAULT NULL;

-- Create index for efficient content quality queries
CREATE INDEX idx_search_results_content_quality ON public.search_results(content_quality);
CREATE INDEX idx_search_results_content_type ON public.search_results(content_type);

-- Add comments for documentation
COMMENT ON COLUMN public.search_results.content_quality IS 'Quality assessment of scraped content: full_paper, abstract_only, insufficient';
COMMENT ON COLUMN public.search_results.content_type IS 'Type of source content: html, pdf, abstract, other';