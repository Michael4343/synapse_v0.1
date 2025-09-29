-- Core schema for Evidentia academic research aggregator
-- This migration contains all essential tables and basic constraints

-- Extensions required for the schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function for updating timestamps
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- PROFILES TABLE
-- =============================================================================
-- User profiles linked to auth.users with personalization metadata
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  orcid_id TEXT,
  academic_website TEXT,
  profile_personalization JSONB NOT NULL DEFAULT '{
    "topic_clusters": [],
    "author_focus": [],
    "venue_focus": [],
    "filters": {
      "recency_days": 1,
      "publication_types": ["journal", "conference", "preprint"],
      "include_preprints": true
    }
  }'::jsonb,
  last_profile_enriched_at TIMESTAMPTZ,
  profile_enrichment_version TEXT
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users with personalization metadata.';
COMMENT ON COLUMN public.profiles.orcid_id IS 'User ORCID identifier for academic research identity.';
COMMENT ON COLUMN public.profiles.academic_website IS 'Primary academic or personal website URL.';
COMMENT ON COLUMN public.profiles.profile_personalization IS 'Structured personalization facets produced by the enrichment workflow.';
COMMENT ON COLUMN public.profiles.last_profile_enriched_at IS 'Timestamp of the most recent profile enrichment run.';
COMMENT ON COLUMN public.profiles.profile_enrichment_version IS 'Prompt/model version used to generate the stored personalization.';

-- =============================================================================
-- PROFILE ENRICHMENT JOBS TABLE
-- =============================================================================
-- Queue + audit trail for profile enrichment executions
CREATE TABLE public.profile_enrichment_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'manual_refresh',
  payload JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT profile_enrichment_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed'))
);

COMMENT ON TABLE public.profile_enrichment_jobs IS 'Queue of profile enrichment executions used to refresh personalization.';
COMMENT ON COLUMN public.profile_enrichment_jobs.status IS 'pending, processing, succeeded, or failed.';
COMMENT ON COLUMN public.profile_enrichment_jobs.source IS 'Trigger origin (manual_refresh, daily_refresh, signup, etc.).';

-- =============================================================================
-- SEARCH CACHE TABLES
-- =============================================================================
-- Search queries cache
CREATE TABLE public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_queries_unique_query UNIQUE (query)
);

-- Search results cache with enhanced content fields
CREATE TABLE public.search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  authors JSONB NOT NULL DEFAULT '[]'::jsonb,
  abstract TEXT,
  year INTEGER,
  venue TEXT,
  citation_count INTEGER DEFAULT 0,
  semantic_scholar_id TEXT UNIQUE,
  arxiv_id TEXT,
  doi TEXT,
  url TEXT,
  source_api TEXT NOT NULL DEFAULT 'semantic_scholar',
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Publication metadata
  publication_date TEXT,
  -- Content scraping fields
  scraped_content TEXT DEFAULT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NULL,
  scraped_url TEXT DEFAULT NULL,
  scrape_status TEXT DEFAULT NULL,
  -- LLM processing fields
  processed_content TEXT DEFAULT NULL,
  processed_at TIMESTAMPTZ DEFAULT NULL,
  processing_status TEXT DEFAULT NULL,
  -- Content quality tracking
  content_quality TEXT DEFAULT NULL,
  content_type TEXT DEFAULT NULL
);

COMMENT ON COLUMN public.search_results.publication_date IS 'Publication date in string format from source API';
COMMENT ON COLUMN public.search_results.scraped_content IS 'Full paper content scraped by Firecrawl in markdown format';
COMMENT ON COLUMN public.search_results.scraped_at IS 'Timestamp when content was last scraped';
COMMENT ON COLUMN public.search_results.scraped_url IS 'URL that was successfully scraped for content';
COMMENT ON COLUMN public.search_results.scrape_status IS 'Status of scraping attempt: success, failed, paywall, timeout';
COMMENT ON COLUMN public.search_results.processed_content IS 'LLM-processed clean paper content organized into readable sections';
COMMENT ON COLUMN public.search_results.processed_at IS 'Timestamp when content was processed by LLM';
COMMENT ON COLUMN public.search_results.processing_status IS 'Status of LLM processing: success, failed, timeout, pending';
COMMENT ON COLUMN public.search_results.content_quality IS 'Quality assessment of scraped content: full_paper, abstract_only, insufficient';
COMMENT ON COLUMN public.search_results.content_type IS 'Type of source content: html, pdf, abstract, other';

-- Search query-result relationship
CREATE TABLE public.search_result_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_id UUID NOT NULL REFERENCES public.search_queries(id) ON DELETE CASCADE,
  search_result_id UUID NOT NULL REFERENCES public.search_results(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_result_queries_unique UNIQUE (search_query_id, search_result_id)
);

-- =============================================================================
-- USER LISTS TABLES
-- =============================================================================
-- User maintained reading lists and saved papers
CREATE TABLE public.user_lists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_lists_unique_name UNIQUE (user_id, name)
);

CREATE TABLE public.list_items (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES public.user_lists(id) ON DELETE CASCADE,
  paper_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
-- Auto-update timestamps on search_results updates
CREATE TRIGGER trig_search_results_updated_at
  BEFORE UPDATE ON public.search_results
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- UNIQUE CONSTRAINTS & INDEXES
-- =============================================================================
-- Unique ORCID constraint
CREATE UNIQUE INDEX profiles_orcid_unique_idx
  ON public.profiles ((lower(orcid_id)))
  WHERE orcid_id IS NOT NULL;