-- Fix critical RLS performance issues causing 6-27 second query times
-- The problem: RLS policies with subqueries execute for EVERY row
-- The solution: Use EXISTS with proper indexes instead of subqueries

-- =============================================================================
-- DROP EXISTING SLOW RLS POLICIES
-- =============================================================================
-- Remove the slow policies created in 0003_permissions.sql
DROP POLICY IF EXISTS "Users can read list items" ON public.list_items;
DROP POLICY IF EXISTS "Users can insert list items" ON public.list_items;
DROP POLICY IF EXISTS "Users can delete list items" ON public.list_items;

-- =============================================================================
-- CREATE EFFICIENT RLS POLICIES
-- =============================================================================
-- Use EXISTS with joins instead of subqueries for much better performance
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

-- =============================================================================
-- ADD CRITICAL COMPOSITE INDEXES FOR RLS POLICY PERFORMANCE
-- =============================================================================
-- These indexes support the EXISTS queries above and are essential for performance

-- Index to support the RLS EXISTS queries
CREATE INDEX IF NOT EXISTS idx_user_lists_id_user_id
  ON public.user_lists(id, user_id);

-- =============================================================================
-- OPTIMIZE EXISTING INDEXES
-- =============================================================================
-- Drop basic indexes that are superseded by composite indexes
DROP INDEX IF EXISTS idx_user_lists_user_id;
DROP INDEX IF EXISTS idx_user_lists_created_at;
DROP INDEX IF EXISTS idx_list_items_list_id;
DROP INDEX IF EXISTS idx_list_items_created_at;

-- Replace with composite indexes that match actual query patterns
-- Note: These may already exist from 0004_indexes.sql, using IF NOT EXISTS for safety
CREATE INDEX IF NOT EXISTS idx_user_lists_user_id_created_at
  ON public.user_lists(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_list_items_list_id_created_at
  ON public.list_items(list_id, created_at DESC);