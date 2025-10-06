-- =============================================================================
-- Paper Verification Request Tracking
-- =============================================================================
-- Tracks VERIFY CLAIMS / VERIFY REPRODUCIBILITY requests and their lifecycle

CREATE TABLE public.paper_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES public.search_results(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('claims', 'reproducibility')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  request_payload JSONB,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.paper_verification_requests IS 'Tracks verification requests triggered by users and their fulfillment status.';
COMMENT ON COLUMN public.paper_verification_requests.request_payload IS 'Snapshot of the user and paper context when the request was submitted.';
COMMENT ON COLUMN public.paper_verification_requests.result_summary IS 'Structured payload of the completed deep research analysis.';

CREATE INDEX idx_verification_requests_paper_type
  ON public.paper_verification_requests (paper_id, verification_type);

CREATE INDEX idx_verification_requests_status
  ON public.paper_verification_requests (status);

CREATE TRIGGER trig_verification_requests_updated_at
  BEFORE UPDATE ON public.paper_verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.paper_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verification requests" ON public.paper_verification_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own verification requests" ON public.paper_verification_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages verification requests" ON public.paper_verification_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.paper_verification_requests TO authenticated;
GRANT ALL PRIVILEGES ON public.paper_verification_requests TO service_role;

