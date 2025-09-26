-- Add scraped content caching to search_results table
-- This allows us to cache Firecrawl results and avoid expensive re-scraping

ALTER TABLE public.search_results
ADD COLUMN scraped_content TEXT DEFAULT NULL,
ADD COLUMN scraped_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN scraped_url TEXT DEFAULT NULL,
ADD COLUMN scrape_status TEXT DEFAULT NULL;

-- Create index for efficient scraped content queries
CREATE INDEX idx_search_results_scraped_at ON public.search_results(scraped_at);
CREATE INDEX idx_search_results_scrape_status ON public.search_results(scrape_status);

-- Add comments for documentation
COMMENT ON COLUMN public.search_results.scraped_content IS 'Full paper content scraped by Firecrawl in markdown format';
COMMENT ON COLUMN public.search_results.scraped_at IS 'Timestamp when content was last scraped';
COMMENT ON COLUMN public.search_results.scraped_url IS 'URL that was successfully scraped for content';
COMMENT ON COLUMN public.search_results.scrape_status IS 'Status of scraping attempt: success, failed, paywall, timeout';