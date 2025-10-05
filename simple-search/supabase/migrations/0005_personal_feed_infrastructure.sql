-- =============================================================================
-- Personal Feed & Script Support Infrastructure
-- =============================================================================
-- This migration creates the minimal infrastructure needed for the personal
-- feed feature, which is populated by the recent-scholar script instead of
-- live API calls for better UI performance.

-- =============================================================================
-- RESEARCHERS TABLE
-- =============================================================================
-- Researchers table links profiles to keywords for the recent-scholar script
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

-- =============================================================================
-- PERSONAL FEED PAPERS TABLE
-- =============================================================================
-- Stores papers fetched by recent-scholar script for instant personal feed loading
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
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.researchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_feed_papers ENABLE ROW LEVEL SECURITY;

-- Researchers policies
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

-- Personal feed papers policies
CREATE POLICY "Users can view own feed papers" ON public.personal_feed_papers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role manages feed papers" ON public.personal_feed_papers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- ROLE GRANTS
-- =============================================================================
-- Authenticated users can manage their own researcher profile
GRANT SELECT, INSERT, UPDATE ON TABLE public.researchers TO authenticated;
-- Authenticated users can read their own feed papers
GRANT SELECT ON TABLE public.personal_feed_papers TO authenticated;

-- Service role has full access for script operations
GRANT ALL PRIVILEGES ON TABLE public.researchers TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.personal_feed_papers TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.personal_feed_papers_id_seq TO service_role;
