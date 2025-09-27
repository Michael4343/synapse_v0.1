-- Fix critical RLS performance issues causing 6-27 second query times
-- The problem: RLS policies with subqueries execute for EVERY row

-- Drop existing slow RLS policies
DROP POLICY IF EXISTS "Users can read list items" ON public.list_items;
DROP POLICY IF EXISTS "Users can insert list items" ON public.list_items;
DROP POLICY IF EXISTS "Users can delete list items" ON public.list_items;

-- Create efficient RLS policies using joins instead of subqueries
-- This prevents the subquery from executing for every single row

CREATE POLICY "Users can read list items" ON public.list_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
      AND ul.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert list items" ON public.list_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
      AND ul.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete list items" ON public.list_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_lists ul
      WHERE ul.id = list_items.list_id
      AND ul.user_id = auth.uid()
    )
  );

-- Add critical composite indexes for RLS policy performance
-- These support the EXISTS queries above
CREATE INDEX IF NOT EXISTS idx_user_lists_id_user_id
  ON public.user_lists(id, user_id);

-- Improve existing indexes for better query performance
DROP INDEX IF EXISTS idx_user_lists_user_id;
DROP INDEX IF EXISTS idx_user_lists_created_at;
DROP INDEX IF EXISTS idx_list_items_list_id;
DROP INDEX IF EXISTS idx_list_items_created_at;

-- Replace with composite indexes that match actual query patterns
CREATE INDEX idx_user_lists_user_id_created_at
  ON public.user_lists(user_id, created_at DESC);

CREATE INDEX idx_list_items_list_id_created_at
  ON public.list_items(list_id, created_at DESC);

-- Add index for paper deduplication (if needed) - use btree for text
CREATE INDEX IF NOT EXISTS idx_list_items_paper_id
  ON public.list_items ((paper_data->>'id'));