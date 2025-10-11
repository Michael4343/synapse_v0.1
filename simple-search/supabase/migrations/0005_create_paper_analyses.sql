-- Adds storage for automated deep research analyses generated via Perplexity + Gemini
CREATE TABLE IF NOT EXISTS public.paper_analyses (
  id BIGSERIAL PRIMARY KEY,
  researcher_id UUID NOT NULL REFERENCES public.researchers(id) ON DELETE CASCADE,
  paper_title TEXT NOT NULL,
  paper_identifier TEXT,
  paper_authors TEXT,
  paper_venue TEXT,
  paper_doi TEXT,
  prompt_fingerprint TEXT,
  perplexity_prompt TEXT NOT NULL,
  perplexity_response TEXT NOT NULL,
  gemini_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'pending', 'approved', 'failed')),
  source TEXT NOT NULL DEFAULT 'perplexity_automation',
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.paper_analyses IS 'Deep-research briefings generated for researchers.';
COMMENT ON COLUMN public.paper_analyses.prompt_fingerprint IS 'Digest of the prompt to support idempotent inserts.';
COMMENT ON COLUMN public.paper_analyses.perplexity_prompt IS 'Exact prompt text sent to Perplexity.';
COMMENT ON COLUMN public.paper_analyses.perplexity_response IS 'Raw Perplexity response prior to Gemini formatting.';
COMMENT ON COLUMN public.paper_analyses.gemini_payload IS 'Structured JSON saved after Gemini formatting.';

CREATE INDEX IF NOT EXISTS idx_paper_analyses_researcher ON public.paper_analyses(researcher_id);
CREATE INDEX IF NOT EXISTS idx_paper_analyses_identifier ON public.paper_analyses(paper_identifier);
CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_analyses_fingerprint ON public.paper_analyses(researcher_id, prompt_fingerprint);

CREATE TRIGGER trig_paper_analyses_updated_at
  BEFORE UPDATE ON public.paper_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.paper_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Researchers can view their analyses"
  ON public.paper_analyses
  FOR SELECT
  USING (researcher_id = auth.uid());

CREATE POLICY "Researchers can insert their analyses"
  ON public.paper_analyses
  FOR INSERT
  WITH CHECK (researcher_id = auth.uid());

CREATE POLICY "Researchers can update their analyses"
  ON public.paper_analyses
  FOR UPDATE
  USING (researcher_id = auth.uid())
  WITH CHECK (researcher_id = auth.uid());

CREATE POLICY "Service role manages paper analyses"
  ON public.paper_analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

