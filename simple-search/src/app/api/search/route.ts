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
  'publicationDate',
].join(',')

const MAX_RESULTS = 12
const CACHE_TTL_MS = 1000 * 60 * 60 * 6 // 6 hours

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const RATE_LIMIT_WITHOUT_KEY = 950 // Leave buffer from 1000 requests/5min shared limit
const RATE_LIMIT_WITH_KEY = 90 // Leave buffer from 100 requests/5min personal limit
const MIN_REQUEST_INTERVAL_MS = 1000 // Minimum 1 second between requests

// Rate limiting state (in-memory for simplicity)
const requestTimestamps: number[] = []
const pendingRequests = new Map<string, Promise<SemanticScholarPaper[]>>()
let lastRequestTime = 0

// Circuit breaker for consecutive failures
let consecutiveFailures = 0
let lastFailureTime = 0
const MAX_CONSECUTIVE_FAILURES = 5
const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes

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
  publicationDate: string | null
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
  publication_date: string | null
}

// Rate limiting helpers
function cleanOldTimestamps() {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS
  const validIndex = requestTimestamps.findIndex(timestamp => timestamp > cutoff)
  if (validIndex > 0) {
    requestTimestamps.splice(0, validIndex)
  }
}

function getRemainingRequests(hasApiKey: boolean): number {
  cleanOldTimestamps()
  const limit = hasApiKey ? RATE_LIMIT_WITH_KEY : RATE_LIMIT_WITHOUT_KEY
  return Math.max(0, limit - requestTimestamps.length)
}

function shouldWaitForRateLimit(hasApiKey: boolean): { shouldWait: boolean; waitMs: number } {
  const remaining = getRemainingRequests(hasApiKey)
  const timeSinceLastRequest = Date.now() - lastRequestTime

  if (remaining <= 0) {
    // Wait until oldest request in window expires, with jitter
    const oldestTimestamp = requestTimestamps[0] || 0
    const baseWaitMs = RATE_LIMIT_WINDOW_MS - (Date.now() - oldestTimestamp) + 1000
    const jitter = Math.random() * 5000 // Add 0-5s jitter to spread requests
    const waitMs = Math.max(0, baseWaitMs + jitter)
    return { shouldWait: true, waitMs }
  }

  // Be more conservative when we're getting close to the limit
  const limit = hasApiKey ? RATE_LIMIT_WITH_KEY : RATE_LIMIT_WITHOUT_KEY
  const usageRatio = (limit - remaining) / limit

  // Add progressive delays as we approach the limit
  let minInterval = MIN_REQUEST_INTERVAL_MS
  if (usageRatio > 0.8) {
    minInterval = MIN_REQUEST_INTERVAL_MS * 3 // 3s when > 80% used
  } else if (usageRatio > 0.6) {
    minInterval = MIN_REQUEST_INTERVAL_MS * 2 // 2s when > 60% used
  }

  if (timeSinceLastRequest < minInterval) {
    // Enforce minimum interval between requests with jitter
    const baseWaitMs = minInterval - timeSinceLastRequest
    const jitter = Math.random() * 500 // Add 0-500ms jitter
    const waitMs = baseWaitMs + jitter
    return { shouldWait: true, waitMs }
  }

  return { shouldWait: false, waitMs: 0 }
}

function recordRequest() {
  const now = Date.now()
  requestTimestamps.push(now)
  lastRequestTime = now
}

async function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isCircuitBreakerOpen(): boolean {
  if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
    return false
  }

  const timeSinceLastFailure = Date.now() - lastFailureTime
  if (timeSinceLastFailure > CIRCUIT_BREAKER_COOLDOWN_MS) {
    // Reset circuit breaker after cooldown
    console.log('Circuit breaker: resetting after cooldown')
    consecutiveFailures = 0
    return false
  }

  const remainingCooldown = Math.ceil((CIRCUIT_BREAKER_COOLDOWN_MS - timeSinceLastFailure) / 1000 / 60)
  console.log(`Circuit breaker: open, ~${remainingCooldown} minutes remaining`)
  return true
}

function recordSuccess() {
  if (consecutiveFailures > 0) {
    console.log(`Rate limiting: success after ${consecutiveFailures} failures`)
  }
  consecutiveFailures = 0
}

function recordFailure() {
  consecutiveFailures++
  lastFailureTime = Date.now()

  // Debug: Show current rate limiting state when failure occurs
  cleanOldTimestamps()
  const hasApiKey = Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY)
  const limit = hasApiKey ? RATE_LIMIT_WITH_KEY : RATE_LIMIT_WITHOUT_KEY
  const remaining = getRemainingRequests(hasApiKey)
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS
  const recentRequests = requestTimestamps.filter(t => t > windowStart)

  console.log(`🚨 Rate limiting: failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`)
  console.log(`📊 Rate limit state: ${recentRequests.length}/${limit} requests in last 5min (${remaining} remaining)`)
  console.log(`⏰ Recent requests: ${recentRequests.map(t => new Date(t).toISOString().slice(11, 19)).join(', ')}`)
  console.log(`🔑 API Key configured: ${hasApiKey ? 'YES' : 'NO'} (limit: ${limit})`)

  // Additional debugging for unexpected rate limits
  if (recentRequests.length < 10) {
    console.log(`⚠️  Unexpected 429 with only ${recentRequests.length} requests - Semantic Scholar may have stricter limits`)
  }

  if (consecutiveFailures === MAX_CONSECUTIVE_FAILURES) {
    console.log(`Circuit breaker: opening due to ${MAX_CONSECUTIVE_FAILURES} consecutive failures`)
  }
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
    .select('*')
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
async function fetchSemanticScholar(query: string, year: number | null): Promise<SemanticScholarPaper[]> {
  const requestKey = `${query}|${year || 'null'}`

  // Request deduplication: if same request is already in flight, return that promise
  const existingRequest = pendingRequests.get(requestKey)
  if (existingRequest) {
    return existingRequest
  }

  // Create and cache the request promise
  const requestPromise = performSemanticScholarRequest(query, year)
  pendingRequests.set(requestKey, requestPromise)

  try {
    const result = await requestPromise
    return result
  } finally {
    // Clean up the pending request
    pendingRequests.delete(requestKey)
  }
}

async function performSemanticScholarRequest(query: string, year: number | null, attempt = 1): Promise<SemanticScholarPaper[]> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY
  const hasApiKey = Boolean(apiKey)
  const userAgent =
    process.env.SEMANTIC_SCHOLAR_USER_AGENT ||
    'EvidentiaAcademicAggregator/0.1 (contact: research@evidentia.local)'

  // Check circuit breaker first
  if (isCircuitBreakerOpen()) {
    console.log('Circuit breaker is open - API requests temporarily disabled')
    throw new Error('Service temporarily unavailable due to repeated API failures')
  }

  // Check rate limits and wait if necessary
  const { shouldWait, waitMs } = shouldWaitForRateLimit(hasApiKey)
  if (shouldWait) {
    console.log(`Rate limit wait: ${waitMs}ms (attempt ${attempt})`)
    await waitFor(waitMs)
  }

  const params = new URLSearchParams({
    query,
    fields: SEMANTIC_SCHOLAR_FIELDS,
    limit: String(MAX_RESULTS),
  });

  if (year) {
    params.append('year', String(year));
  }

  // Record this request for rate limiting
  recordRequest()

  const response = await fetch(`${SEMANTIC_SCHOLAR_ENDPOINT}?${params.toString()}`, {
    headers: {
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'User-Agent': userAgent,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    recordFailure() // Record failure for circuit breaker

    if (response.status === 429 && attempt <= 5) {
      // Exponential backoff with jitter for 429 errors
      // Start with 2 seconds, double each time, add randomness - much more reasonable for user-facing requests
      const baseDelay = 2 * 1000 * Math.pow(2, attempt - 1)
      const jitter = Math.random() * 2 * 1000 // 0-2 second jitter
      const delay = Math.min(baseDelay + jitter, 30 * 1000) // Max 30 seconds

      console.log(`429 rate limit hit, waiting ${delay}ms before retry ${attempt + 1}/5`)
      await waitFor(delay)
      return performSemanticScholarRequest(query, year, attempt + 1)
    }

    const errorMessage = await response
      .json()
      .then((body) => body?.error || body?.message || body)
      .catch(() => undefined)

    const details = errorMessage ? `: ${JSON.stringify(errorMessage)}` : ''
    throw new Error(`Semantic Scholar API responded with ${response.status}${details}`)
  }

  // Record success for circuit breaker
  recordSuccess()

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
    publicationDate: paper.publicationDate || null,
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
    publication_date: paper.publicationDate,
    source_api: paper.source_api,
    raw_data: paper.raw,
  }))

  const { data: upsertedResults, error: upsertError } = await supabaseAdmin
    .from(TABLES.SEARCH_RESULTS)
    .upsert(upsertPayload, {
      onConflict: 'semantic_scholar_id',
    })
    .select()

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
    publicationDate: result.publication_date,
    source: result.source_api ?? 'semantic_scholar',
  }))
}

export async function POST(request: NextRequest) {
  try {
    // Development: Clear stale rate limit state on first request after restart
    if (process.env.NODE_ENV === 'development' && requestTimestamps.length > 0) {
      const oldestTimestamp = requestTimestamps[0] || 0
      const timeSinceOldest = Date.now() - oldestTimestamp

      // If oldest request is >10 minutes old, likely from previous session - clear state
      if (timeSinceOldest > 10 * 60 * 1000) {
        console.log(`🧹 Dev: Clearing stale rate limit state (${requestTimestamps.length} old requests)`)
        requestTimestamps.length = 0
        consecutiveFailures = 0
      }
    }

    const body = await request.json().catch(() => ({}))
    const rawQuery = typeof body.query === 'string' ? body.query : ''
    const year = typeof body.year === 'number' ? body.year : null
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
      papers = await fetchSemanticScholar(query, year)
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
