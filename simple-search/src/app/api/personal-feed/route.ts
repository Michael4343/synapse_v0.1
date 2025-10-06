import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import crypto from 'crypto'

interface PersonalFeedPaper {
  id: number
  user_id: string
  paper_title: string
  paper_url: string | null
  paper_snippet: string | null
  paper_authors: string | null
  publication_date: string | null
  raw_publication_date: string | null
  query_keyword: string
  scraped_at: string
}

interface ApiSearchResult {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  semanticScholarId: string
  arxivId: string | null
  doi: string | null
  url: string | null
  source: string
  publicationDate: string | null
}

function parseAuthors(authorsString: string | null): string[] {
  if (!authorsString) return []

  // Google Scholar format: "X Li, L Li, P Jiang - Journal, 2025 - Publisher"
  // Extract just the author names before the first " - "
  const authorsPart = authorsString.split(' - ')[0]

  // Split by comma and clean up
  return authorsPart
    .split(',')
    .map(author => author.trim())
    .filter(Boolean)
}

function extractYear(dateString: string | null): number | null {
  if (!dateString) return null

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return null

  return date.getFullYear()
}

function generatePaperId(url: string | null, title: string): string {
  // Generate a consistent ID from URL or title
  const source = url || title
  return crypto.createHash('sha256').update(source).digest('hex').substring(0, 40)
}

function transformToApiSearchResult(paper: PersonalFeedPaper): ApiSearchResult {
  return {
    id: generatePaperId(paper.paper_url, paper.paper_title),
    title: paper.paper_title,
    abstract: paper.paper_snippet,
    authors: parseAuthors(paper.paper_authors),
    year: extractYear(paper.publication_date),
    venue: null,
    citationCount: null,
    semanticScholarId: generatePaperId(paper.paper_url, paper.paper_title),
    arxivId: null,
    doi: null,
    url: paper.paper_url,
    source: 'google_scholar',
    publicationDate: paper.publication_date
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query parameters
  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

  // Read cached papers from database
  const { data: papers, error } = await supabase
    .from('personal_feed_papers')
    .select('*')
    .eq('user_id', user.id)
    .order('publication_date', { ascending: false, nullsFirst: false })
    .order('scraped_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[personal-feed] Database error:', error)
    return NextResponse.json({ error: 'Failed to load personal feed' }, { status: 500 })
  }

  // Transform to ApiSearchResult format
  const results = (papers || []).map(transformToApiSearchResult)
  const hasMore = results.length === limit

  return NextResponse.json({
    results,
    lastUpdated: papers?.[0]?.scraped_at || null,
    source: 'cached',
    hasMore
  })
}
