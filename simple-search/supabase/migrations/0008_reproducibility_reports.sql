-- =============================================================================
-- REPRODUCIBILITY REPORTS TABLE
-- =============================================================================
-- Stores AI-generated reproducibility assessments for research papers
-- Each paper gets a simple verdict on how easy it is to reproduce

CREATE TABLE public.reproducibility_reports (
  id BIGSERIAL PRIMARY KEY,
  paper_id TEXT NOT NULL UNIQUE,
  paper_title TEXT NOT NULL,

  -- Quick verdict fields
  score TEXT NOT NULL CHECK (score IN ('easy', 'moderate', 'difficult', 'unknown')),
  time_estimate TEXT,
  cost_estimate TEXT,
  skill_level TEXT,
  summary TEXT,

  -- Full report stored as JSONB
  report_data JSONB NOT NULL,

  -- Metadata
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sources TEXT[]
);

-- Index for quick lookup by paper_id
CREATE INDEX idx_reproducibility_paper_id ON public.reproducibility_reports(paper_id);

-- Index for filtering by score
CREATE INDEX idx_reproducibility_score ON public.reproducibility_reports(score);

-- Trigger to update updated_at timestamp
CREATE TRIGGER touch_reproducibility_reports_updated_at
  BEFORE UPDATE ON public.reproducibility_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- RLS Policies: Reports are publicly readable (no auth required for viewing)
ALTER TABLE public.reproducibility_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can read reproducibility reports
CREATE POLICY "Reproducibility reports are publicly readable"
  ON public.reproducibility_reports
  FOR SELECT
  USING (true);

-- Only service role can insert/update reports (via API)
CREATE POLICY "Service role can manage reproducibility reports"
  ON public.reproducibility_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE public.reproducibility_reports IS 'AI-generated reproducibility assessments for research papers.';
COMMENT ON COLUMN public.reproducibility_reports.paper_id IS 'Unique identifier for the paper (e.g., Semantic Scholar ID, DOI, or arXiv ID).';
COMMENT ON COLUMN public.reproducibility_reports.score IS 'Overall reproducibility difficulty: easy, moderate, difficult, or unknown.';
COMMENT ON COLUMN public.reproducibility_reports.report_data IS 'Full structured report including verdict, requirements, gaps, and related papers.';
COMMENT ON COLUMN public.reproducibility_reports.confidence IS 'AI confidence level in the assessment based on available information.';
COMMENT ON COLUMN public.reproducibility_reports.sources IS 'List of sources analyzed (abstract, full text, supplementary materials, etc.).';
