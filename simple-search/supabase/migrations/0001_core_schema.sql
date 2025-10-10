-- =============================================================================
-- Evidentia Schema (Consolidated)
-- =============================================================================
-- This migration composes the complete application schema, policies, and grants
-- so a fresh database can be recreated with a single migration.

-- -----------------------------------------------------------------------------
-- Extensions & Helper Functions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Core Tables
-- -----------------------------------------------------------------------------
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

CREATE UNIQUE INDEX profiles_orcid_unique_idx
  ON public.profiles ((lower(orcid_id)))
  WHERE orcid_id IS NOT NULL;

-- Profile enrichment job queue -------------------------------------------------
CREATE TABLE public.profile_enrichment_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  source TEXT NOT NULL DEFAULT 'manual_refresh',
  payload JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.profile_enrichment_jobs IS 'Queue of profile enrichment executions used to refresh personalization.';
COMMENT ON COLUMN public.profile_enrichment_jobs.source IS 'Trigger origin (manual_refresh, daily_refresh, signup, etc.).';

-- Cached search queries --------------------------------------------------------
CREATE TABLE public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_queries_unique_query UNIQUE (query)
);

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
  publication_date TEXT,
  scraped_content TEXT,
  scraped_at TIMESTAMPTZ,
  scraped_url TEXT,
  scrape_status TEXT,
  processed_content TEXT,
  processed_at TIMESTAMPTZ,
  processing_status TEXT,
  content_quality TEXT,
  content_type TEXT,
  reproducibility_score REAL,
  reproducibility_status TEXT,
  reproducibility_notes TEXT,
  reproducibility_data JSONB,
  claims_verified JSONB,
  claims_status TEXT,
  similar_papers_status TEXT,
  similar_papers_data JSONB,
  similar_papers_updated_at TIMESTAMPTZ
);

COMMENT ON COLUMN public.search_results.scraped_content IS 'Full paper content scraped by Firecrawl in markdown format.';
COMMENT ON COLUMN public.search_results.reproducibility_data IS 'Structured reproducibility analysis payload.';
COMMENT ON COLUMN public.search_results.similar_papers_status IS 'Workflow status flag for similar paper compilation requests.';
COMMENT ON COLUMN public.search_results.similar_papers_data IS 'Structured similar paper crosswalk output payload.';
COMMENT ON COLUMN public.search_results.similar_papers_updated_at IS 'Timestamp when similar paper data was last updated.';

CREATE TABLE public.search_result_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_id UUID NOT NULL REFERENCES public.search_queries(id) ON DELETE CASCADE,
  search_result_id UUID NOT NULL REFERENCES public.search_results(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_result_queries_unique UNIQUE (search_query_id, search_result_id)
);

-- User lists ------------------------------------------------------------------
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

-- Researchers + personal feed --------------------------------------------------
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

-- Verification requests -------------------------------------------------------
CREATE TABLE public.paper_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES public.search_results(id) ON DELETE CASCADE,
  paper_lookup_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('claims', 'reproducibility', 'combined')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  request_payload JSONB,
  result_summary JSONB,
  similar_papers_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.paper_verification_requests IS 'Tracks verification requests triggered by users and their fulfillment status.';
COMMENT ON COLUMN public.paper_verification_requests.similar_papers_data IS 'Cached similar paper crosswalk payload associated with the request.';

-- Community review requests ---------------------------------------------------
CREATE TABLE public.paper_community_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES public.search_results(id) ON DELETE CASCADE,
  paper_lookup_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  request_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.paper_community_review_requests IS 'Community review requests initiated from VERIFY panels.';

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
CREATE TRIGGER trig_search_results_updated_at
  BEFORE UPDATE ON public.search_results
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trig_researchers_updated_at
  BEFORE UPDATE ON public.researchers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trig_verification_requests_updated_at
  BEFORE UPDATE ON public.paper_verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trig_community_review_requests_updated_at
  BEFORE UPDATE ON public.paper_community_review_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX idx_profile_enrichment_jobs_user_id ON public.profile_enrichment_jobs(user_id);
CREATE INDEX idx_profile_enrichment_jobs_status ON public.profile_enrichment_jobs(status);
CREATE INDEX idx_profile_enrichment_jobs_created_at ON public.profile_enrichment_jobs(created_at DESC);

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

CREATE INDEX idx_search_queries_query ON public.search_queries(query);
CREATE INDEX idx_search_queries_created_at ON public.search_queries(created_at DESC);

CREATE INDEX idx_search_result_queries_query_id ON public.search_result_queries(search_query_id);
CREATE INDEX idx_search_result_queries_result_id ON public.search_result_queries(search_result_id);

CREATE INDEX idx_user_lists_id_user_id ON public.user_lists(id, user_id);
CREATE INDEX idx_user_lists_user_id_created_at ON public.user_lists(user_id, created_at DESC);

CREATE INDEX idx_list_items_list_id_created_at ON public.list_items(list_id, created_at DESC);
CREATE INDEX idx_list_items_paper_id ON public.list_items ((paper_data->>'id'));

CREATE INDEX idx_researchers_status ON public.researchers(status);

CREATE INDEX idx_personal_feed_user_scraped ON public.personal_feed_papers(user_id, scraped_at DESC);
CREATE INDEX idx_personal_feed_scraped_at ON public.personal_feed_papers(scraped_at DESC);
CREATE INDEX idx_personal_feed_publication_date ON public.personal_feed_papers(publication_date DESC);

CREATE INDEX idx_verification_requests_paper_type ON public.paper_verification_requests(paper_id, verification_type);
CREATE INDEX idx_verification_requests_status ON public.paper_verification_requests(status);
CREATE INDEX idx_verification_requests_lookup ON public.paper_verification_requests(paper_lookup_id);

CREATE UNIQUE INDEX idx_community_review_unique_per_user
  ON public.paper_community_review_requests (paper_lookup_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_community_review_lookup ON public.paper_community_review_requests(paper_lookup_id);

-- -----------------------------------------------------------------------------
-- Row Level Security & Policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_result_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.researchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_feed_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_community_review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view their enrichment jobs" ON public.profile_enrichment_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create enrichment jobs" ON public.profile_enrichment_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their enrichment jobs" ON public.profile_enrichment_jobs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages enrichment jobs" ON public.profile_enrichment_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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

CREATE POLICY "Users can manage their lists" ON public.user_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read list items" ON public.list_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
        AND ul.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert list items" ON public.list_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
        AND ul.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete list items" ON public.list_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
        AND ul.user_id = auth.uid()
    )
  );

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

CREATE POLICY "Users can view own feed papers" ON public.personal_feed_papers
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role manages feed papers" ON public.personal_feed_papers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own verification requests" ON public.paper_verification_requests
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own verification requests" ON public.paper_verification_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages verification requests" ON public.paper_verification_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own community review requests" ON public.paper_community_review_requests
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own community review requests" ON public.paper_community_review_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages community review requests" ON public.paper_community_review_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile_enrichment_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.researchers TO authenticated;
GRANT SELECT ON TABLE public.personal_feed_papers TO authenticated;
GRANT SELECT, INSERT ON TABLE public.paper_verification_requests TO authenticated;
GRANT SELECT, INSERT ON TABLE public.paper_community_review_requests TO authenticated;

GRANT SELECT, USAGE ON SEQUENCE public.user_lists_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.list_items_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.profile_enrichment_jobs_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.personal_feed_papers_id_seq TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.profile_enrichment_jobs TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_queries TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_results TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_result_queries TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.user_lists TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.list_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.researchers TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.personal_feed_papers TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.paper_verification_requests TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.paper_community_review_requests TO service_role;

GRANT ALL PRIVILEGES ON SEQUENCE public.user_lists_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.list_items_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.profile_enrichment_jobs_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.personal_feed_papers_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- Auth Helpers
-- -----------------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
