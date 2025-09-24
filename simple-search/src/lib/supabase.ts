import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const supabase = createClientComponentClient()

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
  SEARCH_RESULT_QUERIES: 'search_result_queries'
} as const
