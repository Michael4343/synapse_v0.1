import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// Types for our database schema
export interface SearchResult {
  id: string
  title: string
  authors: string[]
  abstract: string
  year: number | null
  venue: string | null
  citation_count: number | null
  semantic_scholar_id: string
  url: string | null
  created_at: string
}

export interface SearchQuery {
  id: string
  query: string
  results_count: number
  created_at: string
}

// Database table names
export const TABLES = {
  SEARCH_RESULTS: 'search_results',
  SEARCH_QUERIES: 'search_queries',
  SEARCH_RESULT_QUERIES: 'search_result_queries',
  RESEARCHERS: 'researchers',
  PAPER_ANALYSES: 'paper_analyses',
  EMAIL_LOGS: 'email_logs',
  PAPER_FEEDBACK: 'paper_feedback',
  VERIFICATION_REQUESTS: 'paper_verification_requests',
  COMMUNITY_REVIEW_REQUESTS: 'paper_community_review_requests',
  PAPER_DISCUSSIONS: 'paper_discussions'
} as const
