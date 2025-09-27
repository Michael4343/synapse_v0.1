-- Add processed content field for LLM-cleaned paper content
-- This allows us to store Gemini-processed clean versions of scraped papers

ALTER TABLE public.search_results
ADD COLUMN processed_content TEXT DEFAULT NULL,
ADD COLUMN processed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN processing_status TEXT DEFAULT NULL;

-- Create index for efficient processed content queries
CREATE INDEX idx_search_results_processed_at ON public.search_results(processed_at);
CREATE INDEX idx_search_results_processing_status ON public.search_results(processing_status);

-- Add comments for documentation
COMMENT ON COLUMN public.search_results.processed_content IS 'LLM-processed clean paper content organized into readable sections';
COMMENT ON COLUMN public.search_results.processed_at IS 'Timestamp when content was processed by LLM';
COMMENT ON COLUMN public.search_results.processing_status IS 'Status of LLM processing: success, failed, timeout, pending';