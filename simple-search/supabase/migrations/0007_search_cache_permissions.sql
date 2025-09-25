-- Ensure service role can manage search cache tables
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_queries TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_results TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.search_result_queries TO service_role;
