-- =============================================================================
-- Verification Request Lookup Refactor
-- =============================================================================

-- Expand tracking so requests can reference non-search_results content while
-- preserving the original UUID foreign key when available.

ALTER TABLE public.paper_verification_requests
  ADD COLUMN paper_lookup_id TEXT;

UPDATE public.paper_verification_requests
  SET paper_lookup_id = paper_id::text
  WHERE paper_lookup_id IS NULL;

ALTER TABLE public.paper_verification_requests
  ALTER COLUMN paper_lookup_id SET NOT NULL;

ALTER TABLE public.paper_verification_requests
  ALTER COLUMN paper_id DROP NOT NULL;

ALTER TABLE public.paper_verification_requests
  DROP CONSTRAINT paper_verification_requests_verification_type_check;

ALTER TABLE public.paper_verification_requests
  ADD CONSTRAINT paper_verification_requests_verification_type_check
  CHECK (verification_type IN ('claims', 'reproducibility', 'combined'));

CREATE INDEX IF NOT EXISTS idx_verification_requests_lookup
  ON public.paper_verification_requests (paper_lookup_id);

