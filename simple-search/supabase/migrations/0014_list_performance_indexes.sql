-- Simple performance indexes for basic list loading
-- Focus on essential indexes only, no complex views or triggers

-- Basic index for user lists (if not already exists from migration 0005)
CREATE INDEX IF NOT EXISTS idx_user_lists_user_id_created
  ON public.user_lists(user_id, created_at DESC);

-- Basic index for list items (if not already exists from migration 0005)
CREATE INDEX IF NOT EXISTS idx_list_items_list_id_created
  ON public.list_items(list_id, created_at DESC);