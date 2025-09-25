-- User maintained reading lists and saved papers
CREATE TABLE public.user_lists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_lists_unique_name UNIQUE (user_id, name)
);

CREATE TABLE public.list_items (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES public.user_lists(id) ON DELETE CASCADE,
  paper_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their lists"
  ON public.user_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read list items"
  ON public.list_items
  FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM public.user_lists WHERE id = list_id));

CREATE POLICY "Users can insert list items"
  ON public.list_items
  FOR INSERT
  WITH CHECK (auth.uid() = (SELECT user_id FROM public.user_lists WHERE id = list_id));

CREATE POLICY "Users can delete list items"
  ON public.list_items
  FOR DELETE
  USING (auth.uid() = (SELECT user_id FROM public.user_lists WHERE id = list_id));

CREATE INDEX idx_user_lists_user_id ON public.user_lists(user_id);
CREATE INDEX idx_user_lists_created_at ON public.user_lists(created_at DESC);
CREATE INDEX idx_list_items_list_id ON public.list_items(list_id);
CREATE INDEX idx_list_items_created_at ON public.list_items(created_at DESC);
