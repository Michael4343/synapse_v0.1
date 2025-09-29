-- Remove paper ratings feature
-- This migration drops the paper_ratings table and related database objects
-- for databases that already had this table created from earlier migrations

-- Drop indexes first (if they exist)
DROP INDEX IF EXISTS public.idx_paper_ratings_user_id;
DROP INDEX IF EXISTS public.idx_paper_ratings_paper_id;
DROP INDEX IF EXISTS public.idx_paper_ratings_created_at;

-- Drop RLS policies (if they exist)
DROP POLICY IF EXISTS "Users can view their ratings" ON public.paper_ratings;
DROP POLICY IF EXISTS "Users can create ratings" ON public.paper_ratings;
DROP POLICY IF EXISTS "Users can update ratings" ON public.paper_ratings;
DROP POLICY IF EXISTS "Users can delete ratings" ON public.paper_ratings;

-- Revoke grants (if table exists)
REVOKE ALL ON TABLE public.paper_ratings FROM authenticated;
REVOKE ALL ON TABLE public.paper_ratings FROM service_role;
REVOKE ALL ON SEQUENCE public.paper_ratings_id_seq FROM authenticated;
REVOKE ALL ON SEQUENCE public.paper_ratings_id_seq FROM service_role;

-- Drop trigger (if it exists)
DROP TRIGGER IF EXISTS trig_paper_ratings_updated_at ON public.paper_ratings;

-- Drop the table (if it exists)
DROP TABLE IF EXISTS public.paper_ratings;

-- Note: This migration is safe to run even if the table was never created
-- All operations use IF EXISTS to avoid errors