-- Row Level Security (RLS) policies and permissions for Evidentia
-- Consolidates all security policies and role grants

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_result_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_ratings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PROFILES RLS POLICIES
-- =============================================================================
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =============================================================================
-- PROFILE ENRICHMENT JOBS RLS POLICIES
-- =============================================================================
CREATE POLICY "Users can view their enrichment jobs" ON public.profile_enrichment_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create enrichment jobs" ON public.profile_enrichment_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their enrichment jobs" ON public.profile_enrichment_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- =============================================================================
-- SEARCH CACHE RLS POLICIES
-- =============================================================================
-- Search cache tables are managed by service role only
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

-- =============================================================================
-- USER LISTS RLS POLICIES
-- =============================================================================
CREATE POLICY "Users can manage their lists" ON public.user_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: List items policies will be optimized in 0005_rls_performance_fix.sql
CREATE POLICY "Users can read list items" ON public.list_items
  FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM public.user_lists WHERE id = list_id));

CREATE POLICY "Users can insert list items" ON public.list_items
  FOR INSERT
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.user_lists WHERE id = list_id));

CREATE POLICY "Users can delete list items" ON public.list_items
  FOR DELETE
  USING (auth.uid() = (SELECT user_id FROM public.user_lists WHERE id = list_id));

-- =============================================================================
-- PAPER RATINGS RLS POLICIES
-- =============================================================================
CREATE POLICY "Users can view their ratings" ON public.paper_ratings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create ratings" ON public.paper_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update ratings" ON public.paper_ratings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete ratings" ON public.paper_ratings
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- ROLE GRANTS - AUTHENTICATED USERS
-- =============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;

-- Profiles table permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- User content permissions (lists and ratings)
GRANT SELECT, USAGE ON SEQUENCE public.user_lists_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.list_items_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.paper_ratings_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.profile_enrichment_jobs_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paper_ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile_enrichment_jobs TO authenticated;

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
GRANT ALL PRIVILEGES ON TABLE public.paper_ratings TO service_role;

-- Full access to all sequences for service role
GRANT ALL PRIVILEGES ON SEQUENCE public.user_lists_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.list_items_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.paper_ratings_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.profile_enrichment_jobs_id_seq TO service_role;