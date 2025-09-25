import { NextRequest, NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'
import { hydrateSemanticScholarAbstracts } from '@/lib/semantic-scholar-abstract'

const SEMANTIC_SCHOLAR_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/paper/search'
const SEMANTIC_SCHOLAR_FIELDS = [
  'title',
  'abstract',
  'year',
  'venue',
  'citationCount',
  'authors',
  'url',
  'externalIds',
  'openAccessPdf',
].join(',')

const MAX_RESULTS = 12
const CACHE_TTL_MS = 1000 * 60 * 60 * 6 // 6 hours

interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract: string | null
  year: number | null
  venue: string | null
  citationCount: number | null
  url: string | null
  authors?: Array<{ name?: string | null }>
  externalIds?: Record<string, string | string[]>
  openAccessPdf?: { url?: string | null } | null
}

type StoredSearchResult = {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citation_count: number | null
  semantic_scholar_id: string
  arxiv_id: string | null
  doi: string | null
  url: string | null
  source_api: string | null
  created_at: string
}

function normaliseQuery(query: string) {
  return query.trim()
}

async function getCachedResults(query: string): Promise<{ results: StoredSearchResult[]; fresh: boolean } | null> {
  const { data: queryRow, error: queryError } = await supabaseAdmin
    .from(TABLES.SEARCH_QUERIES)
    .select('id, created_at, results_count')
    .eq('query', query)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (queryError) {
    console.error('Supabase search_queries lookup failed', queryError)
    return null
  }

  if (!queryRow) {
    return null
  }

  const createdAt = new Date(queryRow.created_at).getTime()
  const isFresh = Date.now() - createdAt < CACHE_TTL_MS

  const { data: linkRows, error: linkError } = await supabaseAdmin
    .from(TABLES.SEARCH_RESULT_QUERIES)
    .select('search_result_id')
    .eq('search_query_id', queryRow.id)
    .order('created_at', { ascending: true })

  if (linkError) {
    console.error('Supabase search_result_queries lookup failed', linkError)
    return null
  }

  if (!linkRows?.length) {
    return null
  }

  const resultIds = linkRows.map((row) => row.search_result_id)

  const { data: results, error: resultsError } = await supabaseAdmin
    .from(TABLES.SEARCH_RESULTS)
    .select<StoredSearchResult>('*')
    .in('id', resultIds)

  if (resultsError) {
    console.error('Supabase search_results lookup failed', resultsError)
    return null
  }

  const resultsById = new Map(results.map((result) => [result.id, result]))
  const orderedResults = resultIds
    .map((id) => resultsById.get(id))
    .filter((result): result is StoredSearchResult => Boolean(result))

  if (!orderedResults.length) {
    return null
  }

  return {
    results: orderedResults,
    fresh: isFresh,
  }
}
async function fetchSemanticScholar(query: string, attempt = 1): Promise<SemanticScholarPaper[]> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY
  const userAgent =
    process.env.SEMANTIC_SCHOLAR_USER_AGENT ||
    'EvidentiaAcademicAggregator/0.1 (contact: research@evidentia.local)'

  const params = new URLSearchParams({
    query,
    fields: SEMANTIC_SCHOLAR_FIELDS,
    limit: String(MAX_RESULTS),
  })

  const response = await fetch(`${SEMANTIC_SCHOLAR_ENDPOINT}?${params.toString()}`, {
    headers: {
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'User-Agent': userAgent,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    if ((response.status === 429 || response.status === 403) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      return fetchSemanticScholar(query, attempt + 1)
    }

    const errorMessage = await response
      .json()
      .then((body) => body?.error || body?.message || body)
      .catch(() => undefined)

    const details = errorMessage ? `: ${JSON.stringify(errorMessage)}` : ''
    throw new Error(`Semantic Scholar API responded with ${response.status}${details}`)
  }

  const payload = await response.json()
  const papers: SemanticScholarPaper[] = Array.isArray(payload.data) ? payload.data : []

  if (!papers.length) {
    return papers
  }

  return hydrateSemanticScholarAbstracts(papers, userAgent)
}

function transformPaper(paper: SemanticScholarPaper) {
  const authors = (paper.authors ?? [])
    .map((author) => author.name?.trim())
    .filter((name): name is string => Boolean(name))

  const externalIds = paper.externalIds ?? {}
  const doiValue = externalIds.DOI
  const doi = Array.isArray(doiValue) ? doiValue[0] : doiValue ?? null
  const arxivValue = externalIds.ArXiv || externalIds.arXiv || externalIds.ARXIV
  const arxivId = Array.isArray(arxivValue) ? arxivValue[0] : arxivValue ?? null

  const preferredUrl = paper.url || paper.openAccessPdf?.url || (doi ? `https://doi.org/${doi}` : null)

  return {
    title: paper.title,
    abstract: paper.abstract || null,
    authors,
    year: paper.year ?? null,
    venue: paper.venue ?? null,
    citationCount: paper.citationCount ?? null,
    semanticScholarId: paper.paperId,
    doi,
    arxivId,
    url: preferredUrl,
    source_api: 'semantic_scholar',
    raw: paper,
  }
}

async function storeResults(query: string, papers: SemanticScholarPaper[]) {
  const transformed = papers.map(transformPaper)

  if (!transformed.length) {
    return []
  }

  const upsertPayload = transformed.map((paper) => ({
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    citation_count: paper.citationCount,
    semantic_scholar_id: paper.semanticScholarId,
    arxiv_id: paper.arxivId,
    doi: paper.doi,
    url: paper.url,
    source_api: paper.source_api,
    raw_data: paper.raw,
  }))

  const { data: upsertedResults, error: upsertError } = await supabaseAdmin
    .from(TABLES.SEARCH_RESULTS)
    .upsert(upsertPayload, {
      onConflict: 'semantic_scholar_id',
    })
    .select<StoredSearchResult>()

  if (upsertError) {
    throw upsertError
  }

  const { data: queryRow, error: queryError } = await supabaseAdmin
    .from(TABLES.SEARCH_QUERIES)
    .upsert(
      {
        query,
        results_count: transformed.length,
      },
      { onConflict: 'query' }
    )
    .select('id')
    .maybeSingle()

  if (queryError || !queryRow?.id) {
    throw queryError || new Error('Failed to upsert search query record')
  }

  // clear prior links to avoid duplicates if cache refresh
  const { error: deleteError } = await supabaseAdmin
    .from(TABLES.SEARCH_RESULT_QUERIES)
    .delete()
    .eq('search_query_id', queryRow.id)

  if (deleteError) {
    console.error('Failed clearing previous search_result_queries links', deleteError)
  }

  const resultsByExternalId = new Map(
    upsertedResults.map((result) => [result.semantic_scholar_id, result])
  )

  const orderedResults = transformed
    .map((paper) => resultsByExternalId.get(paper.semanticScholarId))
    .filter((result): result is StoredSearchResult => Boolean(result))

  const transformedById = new Map(
    transformed.map((paper) => [paper.semanticScholarId, paper])
  )

  const relationPayload = orderedResults.map((result) => ({
    search_query_id: queryRow.id,
    search_result_id: result.id,
    relevance_score: transformedById.get(result.semantic_scholar_id)?.citationCount ?? 0,
  }))

  if (relationPayload.length) {
    const { error: insertRelationError } = await supabaseAdmin
      .from(TABLES.SEARCH_RESULT_QUERIES)
      .insert(relationPayload)

    if (insertRelationError) {
      console.error('Failed inserting search_result_queries links', insertRelationError)
    }
  }

  return orderedResults
}

function buildResponsePayload(results: StoredSearchResult[]) {
  return results.map((result) => ({
    id: result.id,
    title: result.title,
    abstract: result.abstract,
    authors: result.authors,
    year: result.year,
    venue: result.venue,
    citationCount: result.citation_count,
    semanticScholarId: result.semantic_scholar_id,
    arxivId: result.arxiv_id,
    doi: result.doi,
    url: result.url,
    source: result.source_api ?? 'semantic_scholar',
  }))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const rawQuery = typeof body.query === 'string' ? body.query : ''
    const query = normaliseQuery(rawQuery)

    if (!query) {
      return NextResponse.json({ error: 'Query is required.' }, { status: 400 })
    }

    const cacheHit = await getCachedResults(query)
    if (cacheHit?.fresh && cacheHit.results.length) {
      return NextResponse.json({ results: buildResponsePayload(cacheHit.results), cached: true })
    }

    let papers: SemanticScholarPaper[] = []

    try {
      papers = await fetchSemanticScholar(query)
    } catch (apiError) {
      console.error('Semantic Scholar fetch failed', apiError)

      if (cacheHit?.results?.length) {
        return NextResponse.json({ results: buildResponsePayload(cacheHit.results), cached: true })
      }

      return NextResponse.json(
        { error: 'Unable to fetch results from Semantic Scholar at this time.' },
        { status: 502 }
      )
    }

    if (!papers.length) {
      return NextResponse.json({ results: [] })
    }

    const storedResults = await storeResults(query, papers)

    return NextResponse.json({ results: buildResponsePayload(storedResults), cached: false })
  } catch (error) {
    console.error('Unhandled search API error', error)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
