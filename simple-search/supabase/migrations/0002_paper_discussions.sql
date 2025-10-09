-- =============================================================================
-- Paper discussions (shares + questions + replies)
-- =============================================================================

CREATE TABLE public.paper_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID REFERENCES public.search_results(id) ON DELETE SET NULL,
  paper_lookup_id TEXT NOT NULL,
  paper_title TEXT NOT NULL,
  paper_authors TEXT[] NOT NULL DEFAULT '{}'::text[],
  paper_url TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('share', 'question', 'answer')),
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reply_to_id UUID REFERENCES public.paper_discussions(id) ON DELETE CASCADE,
  author_display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.paper_discussions IS 'Community shares, questions, and replies linked to papers.';
COMMENT ON COLUMN public.paper_discussions.paper_lookup_id IS 'External identifier used when a search_results row is unavailable.';
COMMENT ON COLUMN public.paper_discussions.entry_type IS 'share | question | answer.';
COMMENT ON COLUMN public.paper_discussions.structured_payload IS 'Optional metadata for presentation and follow-up (notify flags, bullet lists, etc.).';

CREATE INDEX idx_paper_discussions_lookup_created_at
  ON public.paper_discussions (paper_lookup_id, created_at DESC);

CREATE INDEX idx_paper_discussions_entry_type_created_at
  ON public.paper_discussions (entry_type, created_at DESC)
  WHERE reply_to_id IS NULL;

CREATE INDEX idx_paper_discussions_reply_to
  ON public.paper_discussions (reply_to_id);

CREATE TRIGGER trig_paper_discussions_touch_updated_at
  BEFORE UPDATE ON public.paper_discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.paper_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view paper discussions" ON public.paper_discussions
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own paper discussions" ON public.paper_discussions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper discussions" ON public.paper_discussions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own paper discussions" ON public.paper_discussions
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paper_discussions TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.paper_discussions TO service_role;

