-- Weekly digest caching table
-- Stores generated weekly research digests per user to avoid regenerating

CREATE TABLE IF NOT EXISTS public.weekly_digests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL, -- Monday of the week this digest covers
  summary TEXT NOT NULL, -- AI-generated summary paragraph
  must_read_papers JSONB NOT NULL DEFAULT '[]', -- Array of paper objects with explanations
  worth_reading_papers JSONB NOT NULL DEFAULT '[]', -- Array of remaining papers with brief notes
  papers_count INTEGER NOT NULL DEFAULT 0, -- Total number of papers analyzed
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one digest per user per week
  UNIQUE(user_id, week_start_date)
);

-- Enable RLS
ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;

-- Users can only access their own digests
CREATE POLICY "Users can access their own weekly digests"
  ON public.weekly_digests
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can manage all digests
CREATE POLICY "Service role can manage weekly digests"
  ON public.weekly_digests
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_weekly_digests_user_week
  ON public.weekly_digests(user_id, week_start_date DESC);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_weekly_digests_generated_at
  ON public.weekly_digests(generated_at);

-- Comment
COMMENT ON TABLE public.weekly_digests IS 'Stores AI-generated weekly research digests for users';
COMMENT ON COLUMN public.weekly_digests.week_start_date IS 'Monday of the week this digest covers (used for uniqueness)';
COMMENT ON COLUMN public.weekly_digests.summary IS '150-200 word AI-generated narrative summary';
COMMENT ON COLUMN public.weekly_digests.must_read_papers IS 'Array of 2-3 most important papers with detailed explanations';
COMMENT ON COLUMN public.weekly_digests.worth_reading_papers IS 'Array of remaining papers with brief notes';