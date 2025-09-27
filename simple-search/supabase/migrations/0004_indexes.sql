-- Performance indexes for Evidentia
-- Consolidated indexes organized by table for optimal query performance

-- =============================================================================
-- PROFILE ENRICHMENT JOBS INDEXES
-- =============================================================================
CREATE INDEX idx_profile_enrichment_jobs_user_id ON public.profile_enrichment_jobs(user_id);
CREATE INDEX idx_profile_enrichment_jobs_status ON public.profile_enrichment_jobs(status);
CREATE INDEX idx_profile_enrichment_jobs_created_at ON public.profile_enrichment_jobs(created_at DESC);

-- =============================================================================
-- SEARCH RESULTS INDEXES
-- =============================================================================
-- Core identifier indexes
CREATE INDEX idx_search_results_semantic_scholar_id ON public.search_results(semantic_scholar_id);

-- Full-text search indexes
CREATE INDEX idx_search_results_title ON public.search_results USING GIN (to_tsvector('english', title));
CREATE INDEX idx_search_results_abstract ON public.search_results USING GIN (to_tsvector('english', abstract));

-- Sorting and filtering indexes
CREATE INDEX idx_search_results_year ON public.search_results(year);
CREATE INDEX idx_search_results_citation_count ON public.search_results(citation_count DESC);
CREATE INDEX idx_search_results_created_at ON public.search_results(created_at DESC);

-- Content scraping indexes
CREATE INDEX idx_search_results_scraped_at ON public.search_results(scraped_at);
CREATE INDEX idx_search_results_scrape_status ON public.search_results(scrape_status);

-- Content processing indexes
CREATE INDEX idx_search_results_processed_at ON public.search_results(processed_at);
CREATE INDEX idx_search_results_processing_status ON public.search_results(processing_status);

-- Content quality indexes
CREATE INDEX idx_search_results_content_quality ON public.search_results(content_quality);
CREATE INDEX idx_search_results_content_type ON public.search_results(content_type);

-- =============================================================================
-- SEARCH QUERIES INDEXES
-- =============================================================================
CREATE INDEX idx_search_queries_query ON public.search_queries(query);
CREATE INDEX idx_search_queries_created_at ON public.search_queries(created_at DESC);

-- =============================================================================
-- SEARCH RESULT QUERIES INDEXES
-- =============================================================================
CREATE INDEX idx_search_result_queries_query_id ON public.search_result_queries(search_query_id);
CREATE INDEX idx_search_result_queries_result_id ON public.search_result_queries(search_result_id);

-- =============================================================================
-- USER LISTS INDEXES
-- =============================================================================
CREATE INDEX idx_user_lists_user_id ON public.user_lists(user_id);
CREATE INDEX idx_user_lists_created_at ON public.user_lists(created_at DESC);
CREATE INDEX idx_user_lists_user_id_created_at ON public.user_lists(user_id, created_at DESC);

-- =============================================================================
-- LIST ITEMS INDEXES
-- =============================================================================
CREATE INDEX idx_list_items_list_id ON public.list_items(list_id);
CREATE INDEX idx_list_items_created_at ON public.list_items(created_at DESC);
CREATE INDEX idx_list_items_list_id_created_at ON public.list_items(list_id, created_at DESC);

-- Paper deduplication index (btree for JSON text extraction)
CREATE INDEX idx_list_items_paper_id ON public.list_items ((paper_data->>'id'));

-- =============================================================================
-- PAPER RATINGS INDEXES
-- =============================================================================
CREATE INDEX idx_paper_ratings_user_id ON public.paper_ratings(user_id);
CREATE INDEX idx_paper_ratings_paper_id ON public.paper_ratings(paper_semantic_scholar_id);
CREATE INDEX idx_paper_ratings_created_at ON public.paper_ratings(created_at DESC);