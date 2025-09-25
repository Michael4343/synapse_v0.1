-- Search cache schema used to persist Semantic Scholar responses
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.search_result_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_id UUID NOT NULL REFERENCES public.search_queries(id) ON DELETE CASCADE,
  search_result_id UUID NOT NULL REFERENCES public.search_results(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_result_queries_unique UNIQUE (search_query_id, search_result_id)
);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_result_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role access"
  ON public.search_queries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role access"
  ON public.search_results
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role access"
  ON public.search_result_queries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_search_results_semantic_scholar_id ON public.search_results(semantic_scholar_id);
CREATE INDEX idx_search_results_title ON public.search_results USING GIN (to_tsvector('english', title));
CREATE INDEX idx_search_results_abstract ON public.search_results USING GIN (to_tsvector('english', abstract));
CREATE INDEX idx_search_results_year ON public.search_results(year);
CREATE INDEX idx_search_results_citation_count ON public.search_results(citation_count DESC);
CREATE INDEX idx_search_results_created_at ON public.search_results(created_at DESC);
CREATE INDEX idx_search_queries_query ON public.search_queries(query);
CREATE INDEX idx_search_queries_created_at ON public.search_queries(created_at DESC);
CREATE INDEX idx_search_result_queries_query_id ON public.search_result_queries(search_query_id);
CREATE INDEX idx_search_result_queries_result_id ON public.search_result_queries(search_result_id);

CREATE TRIGGER trig_search_results_updated_at
  BEFORE UPDATE ON public.search_results
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
