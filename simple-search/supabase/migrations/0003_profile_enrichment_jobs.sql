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

ALTER TABLE public.profile_enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their enrichment jobs" ON public.profile_enrichment_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create enrichment jobs" ON public.profile_enrichment_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their enrichment jobs" ON public.profile_enrichment_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_profile_enrichment_jobs_user_id ON public.profile_enrichment_jobs(user_id);
CREATE INDEX idx_profile_enrichment_jobs_status ON public.profile_enrichment_jobs(status);
CREATE INDEX idx_profile_enrichment_jobs_created_at ON public.profile_enrichment_jobs(created_at DESC);
