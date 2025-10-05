-- =============================================================================
-- EVIDENTIA ACADEMIC RESEARCH AGGREGATOR - COMPLETE DATABASE SCHEMA
-- =============================================================================
-- This is a consolidated reference schema showing the complete database structure.
-- For actual deployment, use the numbered migration files in supabase/migrations/
--
-- IMPORTANT: This file is for reference only. Do not run directly.
-- Use: supabase db push (to apply migrations)
-- Or run migrations individually in order: 0001, 0002, 0003, 0004, 0005
--
-- Migration files (5 total):
--   0001_core_schema.sql - Core tables, functions, triggers, reproducibility fields
--   0002_auth_functions.sql - Auth triggers for auto-profile creation
--   0003_permissions.sql - RLS policies (optimized with EXISTS) and role grants
--   0004_indexes.sql - Performance indexes (optimized composite indexes)
--   0005_personal_feed_infrastructure.sql - Personal feed tables (researchers, personal_feed_papers with created_at)
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function for updating timestamps
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- USER PROFILES & PERSONALIZATION
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

-- Unique ORCID constraint (case-insensitive)
CREATE UNIQUE INDEX profiles_orcid_unique_idx
  ON public.profiles ((lower(orcid_id)))
  WHERE orcid_id IS NOT NULL;

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

-- Indexes for profile enrichment jobs
CREATE INDEX idx_profile_enrichment_jobs_user_id ON public.profile_enrichment_jobs(user_id);
CREATE INDEX idx_profile_enrichment_jobs_status ON public.profile_enrichment_jobs(status);
CREATE INDEX idx_profile_enrichment_jobs_created_at ON public.profile_enrichment_jobs(created_at DESC);

-- =============================================================================
-- SEARCH CACHE SYSTEM
-- =============================================================================

-- Search queries cache
CREATE TABLE public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_queries_unique_query UNIQUE (query)
);

-- Indexes for search queries
CREATE INDEX idx_search_queries_query ON public.search_queries(query);
CREATE INDEX idx_search_queries_created_at ON public.search_queries(created_at DESC);

-- Search results cache with content scraping and processing fields
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
  content_type TEXT DEFAULT NULL,
  -- Reproducibility analysis fields (for future implementation)
  reproducibility_score REAL DEFAULT NULL,
  reproducibility_status TEXT DEFAULT NULL,
  reproducibility_notes TEXT DEFAULT NULL,
  reproducibility_data JSONB DEFAULT NULL,
  -- Claims verification fields (for future implementation)
  claims_verified JSONB DEFAULT NULL,
  claims_status TEXT DEFAULT NULL
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
COMMENT ON COLUMN public.search_results.reproducibility_score IS 'Reproducibility score (0-100) from automated analysis - for future implementation';
COMMENT ON COLUMN public.search_results.reproducibility_status IS 'Status of reproducibility analysis: verified, unverified, flagged, in_progress - for future implementation';
COMMENT ON COLUMN public.search_results.reproducibility_notes IS 'Human-readable notes about reproducibility concerns - for future implementation';
COMMENT ON COLUMN public.search_results.reproducibility_data IS 'Full reproducibility analysis data in JSON format - for future implementation';
COMMENT ON COLUMN public.search_results.claims_verified IS 'Array of verified claims with evidence links - for future implementation';
COMMENT ON COLUMN public.search_results.claims_status IS 'Status of claims verification: verified, unverified, in_progress - for future implementation';

-- Indexes for search results
CREATE INDEX idx_search_results_semantic_scholar_id ON public.search_results(semantic_scholar_id);
CREATE INDEX idx_search_results_title ON public.search_results USING GIN (to_tsvector('english', title));
CREATE INDEX idx_search_results_abstract ON public.search_results USING GIN (to_tsvector('english', abstract));
CREATE INDEX idx_search_results_year ON public.search_results(year);
CREATE INDEX idx_search_results_citation_count ON public.search_results(citation_count DESC);
CREATE INDEX idx_search_results_created_at ON public.search_results(created_at DESC);
CREATE INDEX idx_search_results_scraped_at ON public.search_results(scraped_at);
CREATE INDEX idx_search_results_scrape_status ON public.search_results(scrape_status);
CREATE INDEX idx_search_results_processed_at ON public.search_results(processed_at);
CREATE INDEX idx_search_results_processing_status ON public.search_results(processing_status);
CREATE INDEX idx_search_results_content_quality ON public.search_results(content_quality);
CREATE INDEX idx_search_results_content_type ON public.search_results(content_type);

-- Trigger for auto-updating updated_at timestamp
CREATE TRIGGER trig_search_results_updated_at
  BEFORE UPDATE ON public.search_results
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Search query-result relationship (junction table)
CREATE TABLE public.search_result_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_id UUID NOT NULL REFERENCES public.search_queries(id) ON DELETE CASCADE,
  search_result_id UUID NOT NULL REFERENCES public.search_results(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_result_queries_unique UNIQUE (search_query_id, search_result_id)
);

-- Indexes for search result queries
CREATE INDEX idx_search_result_queries_query_id ON public.search_result_queries(search_query_id);
CREATE INDEX idx_search_result_queries_result_id ON public.search_result_queries(search_result_id);

-- =============================================================================
-- USER LISTS & SAVED PAPERS
-- =============================================================================

-- User maintained reading lists
CREATE TABLE public.user_lists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_lists_unique_name UNIQUE (user_id, name)
);

-- Indexes for user lists (optimized for RLS performance)
-- Critical composite index for RLS policy performance
CREATE INDEX idx_user_lists_id_user_id ON public.user_lists(id, user_id);
-- Composite index for list queries and sorting
CREATE INDEX idx_user_lists_user_id_created_at ON public.user_lists(user_id, created_at DESC);

-- Papers saved to lists (stores paper data as JSONB)
CREATE TABLE public.list_items (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES public.user_lists(id) ON DELETE CASCADE,
  paper_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for list items
CREATE INDEX idx_list_items_list_id_created_at ON public.list_items(list_id, created_at DESC);
CREATE INDEX idx_list_items_paper_id ON public.list_items ((paper_data->>'id'));

-- =============================================================================
-- PERSONAL FEED INFRASTRUCTURE
-- =============================================================================

-- Researchers table for recent-scholar script
CREATE TABLE public.researchers (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  research_interests TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.researchers IS 'Researchers who receive pre-fetched paper feeds via recent-scholar script.';
COMMENT ON COLUMN public.researchers.research_interests IS 'Keywords used by recent-scholar to query Google Scholar API.';
COMMENT ON COLUMN public.researchers.status IS 'active researchers get papers fetched, paused researchers are skipped.';

-- Trigger for auto-updating timestamps
CREATE TRIGGER trig_researchers_updated_at
  BEFORE UPDATE ON public.researchers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Index for efficient active researcher queries
CREATE INDEX idx_researchers_status ON public.researchers(status);

-- Personal feed papers table (populated by recent-scholar script)
CREATE TABLE public.personal_feed_papers (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paper_title TEXT NOT NULL,
  paper_url TEXT,
  paper_snippet TEXT,
  paper_authors TEXT,
  publication_date TIMESTAMPTZ,
  raw_publication_date TEXT,
  query_keyword TEXT NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.personal_feed_papers IS 'Pre-fetched papers for personal feed, populated by recent-scholar script.';
COMMENT ON COLUMN public.personal_feed_papers.query_keyword IS 'Keyword that matched this paper from researcher interests.';
COMMENT ON COLUMN public.personal_feed_papers.scraped_at IS 'When the recent-scholar script fetched this paper.';

-- Indexes for efficient personal feed queries
-- Composite index for user-specific feed queries (most common query pattern)
CREATE INDEX idx_personal_feed_user_scraped ON public.personal_feed_papers(user_id, scraped_at DESC);
-- Standalone indexes for global queries and sorting
CREATE INDEX idx_personal_feed_scraped_at ON public.personal_feed_papers(scraped_at DESC);
CREATE INDEX idx_personal_feed_publication_date ON public.personal_feed_papers(publication_date DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_result_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.researchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_feed_papers ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Profile enrichment jobs RLS policies
CREATE POLICY "Users can view their enrichment jobs" ON public.profile_enrichment_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create enrichment jobs" ON public.profile_enrichment_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their enrichment jobs" ON public.profile_enrichment_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role access for enrichment jobs" ON public.profile_enrichment_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Search cache RLS policies (service role only)
CREATE POLICY "Service role access" ON public.search_queries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role access" ON public.search_results
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role access" ON public.search_result_queries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- User lists RLS policies
CREATE POLICY "Users can manage their lists" ON public.user_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- List items RLS policies (optimized with EXISTS for performance)
CREATE POLICY "Users can read list items" ON public.list_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
      AND ul.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert list items" ON public.list_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
      AND ul.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete list items" ON public.list_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
      AND ul.user_id = auth.uid()
    )
  );

-- Researchers RLS policies
CREATE POLICY "Researchers can view own profile" ON public.researchers
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Researchers can insert own profile" ON public.researchers
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Researchers can update own profile" ON public.researchers
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Service role manages researchers" ON public.researchers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Personal feed papers RLS policies
CREATE POLICY "Users can view own feed papers" ON public.personal_feed_papers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role manages feed papers" ON public.personal_feed_papers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- ROLE GRANTS - AUTHENTICATED USERS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

-- Profiles table permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- User content permissions (lists)
GRANT SELECT, USAGE ON SEQUENCE public.user_lists_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.list_items_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.profile_enrichment_jobs_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile_enrichment_jobs TO authenticated;

-- Personal feed permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.researchers TO authenticated;
GRANT SELECT ON TABLE public.personal_feed_papers TO authenticated;

-- =============================================================================
-- ROLE GRANTS - SERVICE ROLE
-- =============================================================================

GRANT USAGE ON SCHEMA public TO service_role;

-- Full access to all tables for service role
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.profile_enrichment_jobs TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_queries TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_results TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_result_queries TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.user_lists TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.list_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.researchers TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.personal_feed_papers TO service_role;

-- Full access to all sequences for service role
GRANT ALL PRIVILEGES ON SEQUENCE public.user_lists_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.list_items_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.profile_enrichment_jobs_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.personal_feed_papers_id_seq TO service_role;

-- =============================================================================
-- SCHEMA SUMMARY
-- =============================================================================
-- Tables: 9
--   1. profiles - User profiles with ORCID and personalization (email digest removed)
--   2. profile_enrichment_jobs - Queue for profile enrichment tasks
--   3. search_queries - Cached search queries
--   4. search_results - Cached paper results with scraping/processing/reproducibility fields
--   5. search_result_queries - Junction table linking queries to results
--   6. user_lists - User-created reading lists
--   7. list_items - Papers saved to lists
--   8. researchers - Researchers linked to profiles for script-based feed population
--   9. personal_feed_papers - Pre-fetched papers for instant personal feed loading
--
-- Features:
--   - Full RLS security on all tables
--   - Optimized indexes for performance (composite indexes for RLS)
--   - Auto-profile creation on user signup
--   - Content scraping and LLM processing support
--   - ORCID integration for academic identity
--   - Personal feed populated by scholar-feed.mjs script (not live API calls)
--   - Optimized RLS policies using EXISTS for sub-second performance
--   - Reproducibility/claims fields prepared for future implementation
-- =============================================================================
