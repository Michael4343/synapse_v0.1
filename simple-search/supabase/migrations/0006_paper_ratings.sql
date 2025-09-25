-- User ratings and annotations for papers
CREATE TABLE public.paper_ratings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paper_semantic_scholar_id TEXT NOT NULL,
  paper_title TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_ratings_unique_user_paper UNIQUE (user_id, paper_semantic_scholar_id)
);

ALTER TABLE public.paper_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their ratings"
  ON public.paper_ratings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create ratings"
  ON public.paper_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update ratings"
  ON public.paper_ratings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete ratings"
  ON public.paper_ratings
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_paper_ratings_user_id ON public.paper_ratings(user_id);
CREATE INDEX idx_paper_ratings_paper_id ON public.paper_ratings(paper_semantic_scholar_id);
CREATE INDEX idx_paper_ratings_created_at ON public.paper_ratings(created_at DESC);

CREATE TRIGGER trig_paper_ratings_updated_at
  BEFORE UPDATE ON public.paper_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
