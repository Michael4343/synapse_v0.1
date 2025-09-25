-- Allow authenticated users and service role to manage list and rating tables
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.user_lists_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.list_items_id_seq TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE public.paper_ratings_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paper_ratings TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.user_lists TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.list_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.paper_ratings TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.user_lists_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.list_items_id_seq TO service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.paper_ratings_id_seq TO service_role;
