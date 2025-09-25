import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { hydrateSemanticScholarAbstracts } from '../../../../lib/semantic-scholar-abstract'

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
}

const SEMANTIC_SCHOLAR_BATCH_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/paper/batch'
const SEMANTIC_SCHOLAR_SEARCH_ENDPOINT = 'https://api.semanticscholar.org/graph/v1/paper/search'
const SEMANTIC_SCHOLAR_FIELDS = [
  'title',
  'abstract',
  'year',
  'venue',
  'citationCount',
  'url',
  'authors',
  'externalIds',
  'openAccessPdf',
].join(',')

const SEMANTIC_SCHOLAR_USER_AGENT_FALLBACK = 'EvidentiaAcademicAggregator/0.1 (contact: research@evidentia.local)'
const MAX_SEARCH_FALLBACKS = 5

interface SemanticScholarAuthor {
  name?: string | null
}

interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract: string | null
  year: number | null
  venue: string | null
  citationCount: number | null
  url: string | null
  authors?: SemanticScholarAuthor[]
  externalIds?: Record<string, string | string[] | null>
  openAccessPdf?: { url?: string | null } | null
}

type CompileGoal = 'methods' | 'claims'

interface CompileRequest {
  paper: ApiSearchResult
  goal?: CompileGoal
  options?: {
    listName?: string
    maxResults?: number
  }
}

interface CompileResponse {
  success: boolean
  list?: {
    id: number
    name: string
    items_count: number
  }
  papers?: ApiSearchResult[]
  researchSummary?: string
  message: string
}

export async function POST(request: NextRequest): Promise<NextResponse<CompileResponse>> {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 })
    }

    const body: CompileRequest = await request.json()
    const { paper, options } = body

    if (!paper || !paper.title) {
      return NextResponse.json({
        success: false,
        message: 'Paper data is required'
      }, { status: 400 })
    }

    const apiKey = process.env.PERPLEXITY_API_KEY

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'Perplexity API not configured'
      }, { status: 500 })
    }

    const goal: CompileGoal = body.goal === 'claims' ? 'claims' : 'methods'
    const maxResults = clampResults(options?.maxResults)

    console.debug('Compile request received', {
      goal,
      maxResults,
      paperTitle: paper.title
    })

    // Generate research query based on paper content and compile goal
    const researchQuery = generateResearchQuery(paper, goal, maxResults)

    // Call Perplexity Sonar Deep Research API
    const researchResults = await callPerplexityDeepResearch(researchQuery, goal, maxResults, apiKey)

    console.debug('Deep research raw length', researchResults.length)
    console.debug('Deep research preview', researchResults.slice(0, 400))

    // Parse research results to extract related papers
    const parsedResults = parseResearchResults(researchResults, maxResults)
    let relatedPapers = parsedResults.papers
    const structuredSummary = parsedResults.summary

    console.debug('Parsed research results', {
      structuredSummary: structuredSummary ? `${structuredSummary.slice(0, 120)}...` : null,
      paperCount: relatedPapers.length
    })

    if (relatedPapers.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No related papers found in research results'
      }, { status: 404 })
    }

    relatedPapers = await enrichPapersWithSemanticScholar(relatedPapers)

    const cleanedSummary = sanitiseResearchSummary(structuredSummary ?? extractResearchSummary(researchResults))

    // Create new list with auto-generated name
    const listName = options?.listName || generateListName(paper)

    const { data: newList, error: listError } = await supabase
      .from('user_lists')
      .insert({
        user_id: user.id,
        name: listName
      })
      .select()
      .single()

    if (listError) {
      console.error('Database error creating list:', listError)
      return NextResponse.json({
        success: false,
        message: 'Failed to create research list'
      }, { status: 500 })
    }

    // Add papers to the list
    const listItems = relatedPapers.map(paper => ({
      list_id: newList.id,
      paper_data: paper
    }))

    const { error: itemsError } = await supabase
      .from('list_items')
      .insert(listItems)

    if (itemsError) {
      console.error('Database error adding papers:', itemsError)
      // Clean up the list if paper insertion failed
      await supabase
        .from('user_lists')
        .delete()
        .eq('id', newList.id)

      return NextResponse.json({
        success: false,
        message: 'Failed to add papers to research list'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      list: {
        id: newList.id,
        name: newList.name,
        items_count: relatedPapers.length
      },
      papers: relatedPapers,
      researchSummary: cleanedSummary,
      message: `Successfully compiled ${relatedPapers.length} related papers`
    })

  } catch (error) {
    console.error('Research compile error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal server error during research compilation'
    }, { status: 500 })
  }
}

function generateResearchQuery(paper: ApiSearchResult, goal: CompileGoal, maxResults: number): string {
  const title = paper.title
  const abstract = paper.abstract ? paper.abstract.slice(0, 500) : ''
  const authors = paper.authors.slice(0, 3).join(', ')
  const venue = paper.venue || ''
  const focusLine = goal === 'claims'
    ? 'Highlight studies that report comparable or contrasting findings, outcomes, or claims.'
    : 'Emphasise works that share methodologies, experimental setups, or analytical techniques.'

  return `Target paper:

Title: "${title}"
Authors: ${authors}
${venue ? `Published in: ${venue}` : ''}
${abstract ? `Abstract: ${abstract}` : ''}

Research focus: ${focusLine}

Task: Identify up to ${maxResults} high-quality academic papers published in reputable venues that most directly support this focus. Prioritise recent work where possible and include seminal references when essential for context.

Output requirements:
- Provide only papers that a domain expert would consider substantively related.
- Include a brief relevance note that captures why the paper belongs in this set.
- Prefer peer-reviewed sources; include preprints only when highly influential.

Return the findings using the structured JSON format requested in the system instructions.`
}

async function callPerplexityDeepResearch(query: string, goal: CompileGoal, maxResults: number, apiKey: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(goal, maxResults)
  const structuredBody = buildPerplexityRequestBody(systemPrompt, query, maxResults, true)

  try {
    return await performPerplexityRequest(structuredBody, apiKey)
  } catch (error) {
    console.warn('Structured deep research request failed, retrying without schema', error)
    const fallbackBody = buildPerplexityRequestBody(systemPrompt, query, maxResults, false)
    return await performPerplexityRequest(fallbackBody, apiKey)
  }
}

interface PerplexityRequestBody {
  model: string
  messages: Array<{ role: 'system' | 'user'; content: string }>
  response_format?: Record<string, unknown>
}

async function performPerplexityRequest(body: PerplexityRequestBody, apiKey: string): Promise<string> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Perplexity API error: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content in Perplexity API response')
  }

  return content
}

function buildPerplexityRequestBody(systemPrompt: string, userPrompt: string, maxResults: number, includeSchema: boolean): PerplexityRequestBody {
  const body: PerplexityRequestBody = {
    model: 'sonar-deep-research',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ]
  }

  if (includeSchema) {
    body.response_format = buildResponseFormatSchema(maxResults)
  }

  return body
}

function buildSystemPrompt(goal: CompileGoal, maxResults: number): string {
  const boundedMax = Math.max(1, Math.min(maxResults, 25))
  const focus = goal === 'claims'
    ? 'Surface papers that report similar or contrasting findings, outcomes, or claims to the target work.'
    : 'Surface papers that employ comparable methodologies, experimental techniques, or analytical frameworks to the target work.'

  return [
    'You are an assistant for academic literature reviews.',
    focus,
    `Return no more than ${boundedMax} papers that a domain expert would consider highly relevant.`,
    'Respond with valid JSON only. Do not include Markdown code fences or free-form commentary.',
    'For optional fields, omit them instead of using null. Provide author names as an array of strings and use integers for years when available.'
  ].join(' ')
}

function buildResponseFormatSchema(maxResults: number): Record<string, unknown> {
  const boundedMax = Math.max(1, Math.min(maxResults, 25))

  return {
    type: 'json_schema',
    json_schema: {
      name: 'related_research_response',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'papers'],
        properties: {
          summary: {
            type: 'string',
            description: 'Concise synthesis of themes across the recommended papers.'
          },
          papers: {
            type: 'array',
            maxItems: boundedMax,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'relevance'],
              properties: {
                title: { type: 'string', minLength: 5 },
                authors: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Author names in publication order.'
                },
                year: { type: 'integer', description: 'Four-digit publication year.' },
                venue: { type: 'string', description: 'Publication venue or journal.' },
                doi: { type: 'string', description: 'Digital Object Identifier if available.' },
                url: { type: 'string', format: 'uri', description: 'Stable link to the paper.' },
                abstract: { type: 'string', description: 'Optional abstract text if relevant.' },
                relevance: { type: 'string', minLength: 10 }
              }
            }
          }
        }
      }
    }
  }
}

function parseResearchResults(researchText: string, maxResults: number): { papers: ApiSearchResult[]; summary: string | null } {
  const structured = parseStructuredResearchResults(researchText, maxResults)
  if (structured) {
    return structured
  }

  return {
    papers: parseResearchResultsFallback(researchText, maxResults),
    summary: null
  }
}

async function enrichPapersWithSemanticScholar(papers: ApiSearchResult[]): Promise<ApiSearchResult[]> {
  if (!papers.length) {
    return papers
  }

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY
  const userAgent = process.env.SEMANTIC_SCHOLAR_USER_AGENT || SEMANTIC_SCHOLAR_USER_AGENT_FALLBACK

  const idLookup = new Map<number, string[]>()
  const batchIds = new Set<string>()

  papers.forEach((paper, index) => {
    const ids = collectSemanticScholarLookupIds(paper)
    if (ids.length) {
      idLookup.set(index, ids)
      ids.forEach(id => batchIds.add(id))
    }
  })

  const enrichedById = batchIds.size
    ? await fetchSemanticScholarBatch(Array.from(batchIds), apiKey, userAgent)
    : new Map<string, SemanticScholarPaper>()

  const merged: ApiSearchResult[] = papers.map((paper) => ({ ...paper }))
  const matchedIndexes = new Set<number>()

  for (const [index, ids] of idLookup.entries()) {
    let matchedPaper: SemanticScholarPaper | null = null
    for (const id of ids) {
      const candidate = enrichedById.get(id)
      if (candidate) {
        matchedPaper = candidate
        break
      }
    }

    if (matchedPaper) {
      merged[index] = mergeSemanticScholarData(papers[index], transformSemanticScholarPaper(matchedPaper))
      matchedIndexes.add(index)
    }
  }

  const unmatchedIndexes = merged.map((_, index) => index).filter(index => !matchedIndexes.has(index))
  let fallbackLookups = 0

  for (const index of unmatchedIndexes) {
    if (fallbackLookups >= MAX_SEARCH_FALLBACKS) {
      break
    }

    const paper = papers[index]
    if (!paper.title) {
      continue
    }

    const searchResult = await searchSemanticScholarByTitle(paper.title, apiKey, userAgent)
    fallbackLookups++

    if (searchResult) {
      merged[index] = mergeSemanticScholarData(merged[index], transformSemanticScholarPaper(searchResult))
      matchedIndexes.add(index)
    }
  }

  return merged.map(paper => ({
    ...paper,
    authors: paper.authors.length ? paper.authors : ['Unknown'],
    abstract: paper.abstract ?? null,
    citationCount: paper.citationCount ?? null,
    semanticScholarId: paper.semanticScholarId || '',
    source: paper.source || 'perplexity_research'
  }))
}

function collectSemanticScholarLookupIds(paper: ApiSearchResult): string[] {
  const ids = new Set<string>()

  if (paper.semanticScholarId) {
    ids.add(paper.semanticScholarId)
  }

  const doi = paper.doi || normaliseDoi(paper.url)
  if (doi) {
    ids.add(`DOI:${doi}`)
  }

  const arxivId = extractArxivIdFromUrl(paper.url)
  if (arxivId) {
    ids.add(`ARXIV:${arxivId}`)
  }

  return Array.from(ids)
}

async function fetchSemanticScholarBatch(ids: string[], apiKey: string | undefined, userAgent: string): Promise<Map<string, SemanticScholarPaper>> {
  if (!ids.length) {
    return new Map()
  }

  try {
    const params = new URLSearchParams({ fields: SEMANTIC_SCHOLAR_FIELDS })
    const response = await fetch(`${SEMANTIC_SCHOLAR_BATCH_ENDPOINT}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': userAgent,
        ...(apiKey ? { 'x-api-key': apiKey } : {})
      },
      body: JSON.stringify({ ids })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn('Semantic Scholar batch request failed', {
        status: response.status,
        error: errorText
      })
      return new Map()
    }

    const payload = await response.json()
    if (!Array.isArray(payload)) {
      console.warn('Unexpected batch payload format from Semantic Scholar', {
        payloadType: typeof payload
      })
      return new Map()
    }

    const validEntries: Array<{ requestId: string; paper: SemanticScholarPaper }> = []

    payload.forEach((item, index) => {
      const requestId = ids[index]
      if (!requestId || !item || typeof item !== 'object' || 'error' in item) {
        return
      }

      validEntries.push({ requestId, paper: item as SemanticScholarPaper })
    })

    if (!validEntries.length) {
      return new Map()
    }

    const hydratedPapers = await hydrateSemanticScholarAbstracts(
      validEntries.map((entry) => entry.paper),
      userAgent
    )

    const result = new Map<string, SemanticScholarPaper>()

    hydratedPapers.forEach((paper, index) => {
      const requestId = validEntries[index].requestId
      result.set(requestId, paper)
      if (paper.paperId) {
        result.set(paper.paperId, paper)
      }
    })

    return result
  } catch (error) {
    console.error('Semantic Scholar batch enrichment failed', error)
    return new Map()
  }
}

async function searchSemanticScholarByTitle(title: string, apiKey: string | undefined, userAgent: string): Promise<SemanticScholarPaper | null> {
  const trimmed = title.trim()
  if (!trimmed) {
    return null
  }

  try {
    const params = new URLSearchParams({
      query: trimmed,
      fields: SEMANTIC_SCHOLAR_FIELDS,
      limit: '1'
    })

    const response = await fetch(`${SEMANTIC_SCHOLAR_SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
        ...(apiKey ? { 'x-api-key': apiKey } : {})
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn('Semantic Scholar fallback search failed', {
        status: response.status,
        error: errorText
      })
      return null
    }

    const payload = await response.json()
    const first = Array.isArray(payload?.data) ? payload.data[0] : null
    if (!first || typeof first !== 'object') {
      return null
    }

    const [hydrated] = await hydrateSemanticScholarAbstracts([first as SemanticScholarPaper], userAgent)
    return hydrated ?? null
  } catch (error) {
    console.error('Semantic Scholar fallback search error', error)
    return null
  }
}

interface SemanticScholarTransformed {
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  semanticScholarId: string
  doi: string | null
  arxivId: string | null
  url: string | null
}

function transformSemanticScholarPaper(paper: SemanticScholarPaper): SemanticScholarTransformed {
  const authors = (paper.authors ?? [])
    .map(author => author.name?.trim())
    .filter((name): name is string => Boolean(name))

  const externalIds = paper.externalIds ?? {}
  const doiValue = externalIds.DOI ?? externalIds.doi ?? externalIds.Doi ?? null
  const doi = Array.isArray(doiValue) ? doiValue[0] ?? null : doiValue
  const arxivValue = externalIds.ArXiv || externalIds.arXiv || externalIds.ARXIV || null
  const arxivId = Array.isArray(arxivValue) ? arxivValue[0] ?? null : arxivValue

  const preferredUrl = paper.url || paper.openAccessPdf?.url || (doi ? `https://doi.org/${doi}` : null)
  const resolvedDoi = typeof doi === 'string' ? normaliseDoi(doi) : null
  const resolvedUrl = preferredUrl ? normaliseUrl(preferredUrl, resolvedDoi) : null

  return {
    title: paper.title,
    abstract: paper.abstract ?? null,
    authors,
    year: paper.year ?? null,
    venue: paper.venue ?? null,
    citationCount: paper.citationCount ?? null,
    semanticScholarId: paper.paperId,
    doi: resolvedDoi,
    arxivId: typeof arxivId === 'string' ? arxivId : null,
    url: resolvedUrl
  }
}

function mergeSemanticScholarData(original: ApiSearchResult, enriched: SemanticScholarTransformed): ApiSearchResult {
  const doi = enriched.doi ?? original.doi
  const url = enriched.url ?? original.url ?? (doi ? `https://doi.org/${doi}` : null)

  return {
    ...original,
    title: enriched.title || original.title,
    abstract: enriched.abstract ?? original.abstract,
    authors: enriched.authors.length ? enriched.authors : original.authors,
    year: enriched.year ?? original.year,
    venue: enriched.venue ?? original.venue,
    citationCount: enriched.citationCount ?? original.citationCount,
    semanticScholarId: enriched.semanticScholarId || original.semanticScholarId,
    arxivId: enriched.arxivId ?? original.arxivId,
    doi,
    url
  }
}

function extractArxivIdFromUrl(url: string | null): string | null {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/(?:abs|pdf)\/([^\/?#]+)/i)
    if (match) {
      return match[1]
    }
  } catch (error) {
    // Ignore invalid URLs
  }

  return null
}

function parseStructuredResearchResults(researchText: string, maxResults: number): { papers: ApiSearchResult[]; summary: string | null } | null {
  const parsed = tryParseJsonLike(researchText)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.debug('Structured parse failed: non-object payload')
    return null
  }

  const record = parsed as Record<string, unknown>
  const summary = typeof record.summary === 'string' ? record.summary.trim() || null : null
  const rawPapers = record.papers

  if (!Array.isArray(rawPapers)) {
    console.debug('Structured parse failed: papers not array', {
      keys: Object.keys(record)
    })
    return summary ? { papers: [], summary } : null
  }

  const baseTimestamp = Date.now()
  const papers: ApiSearchResult[] = []

  for (let index = 0; index < rawPapers.length && papers.length < maxResults; index++) {
    const entry = rawPapers[index]
    const paper = createPaperFromStructured(entry, baseTimestamp, index)
    if (paper) {
      papers.push(paper)
    } else {
      console.debug('Structured parse skipped entry', { index, entry })
    }
  }

  if (papers.length === 0) {
    console.debug('Structured parse yielded zero papers despite array input', {
      candidateCount: rawPapers.length
    })
    return summary ? { papers: [], summary } : null
  }

  return { papers, summary }
}

function tryParseJsonLike(text: string): unknown {
  const trimmed = text.trim()
  const attempts: string[] = []

  if (trimmed) {
    attempts.push(trimmed)
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch && fencedMatch[1]) {
    attempts.push(fencedMatch[1].trim())
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of attempts) {
    if (!candidate) continue
    try {
      return JSON.parse(candidate)
    } catch (error) {
      console.debug('JSON parse attempt failed', {
        length: candidate.length,
        snippet: candidate.slice(0, 120)
      })
      continue
    }
  }

  console.debug('All JSON parse attempts exhausted')
  return null
}

function createPaperFromStructured(entry: unknown, baseTimestamp: number, index: number): ApiSearchResult | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const data = entry as Record<string, unknown>
  const rawTitle = typeof data.title === 'string' ? data.title.trim() : ''
  if (!rawTitle) {
    return null
  }

  const authors = Array.isArray(data.authors)
    ? data.authors
        .map(author => (typeof author === 'string' ? author.trim() : ''))
        .filter(author => author.length > 0 && author.length < 100)
    : []

  const year = normaliseYear(data.year)
  const venue = typeof data.venue === 'string' ? data.venue.trim() || null : null
  const doi = normaliseDoi(data.doi ?? data.DOI ?? data.Doi)
  const url = normaliseUrl(data.url ?? data.link, doi)
  const relevance = typeof data.relevance === 'string' ? data.relevance.trim() : ''
  const abstractText = typeof data.abstract === 'string' ? data.abstract.trim() : ''
  const abstract = abstractText || relevance || null

  return {
    id: `research_${baseTimestamp}_${index}`,
    title: rawTitle,
    abstract,
    authors,
    year,
    venue,
    citationCount: null,
    semanticScholarId: '',
    arxivId: null,
    doi,
    url,
    source: 'perplexity_research'
  }
}

function normaliseYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value)
    return rounded >= 1800 && rounded <= 2100 ? rounded : null
  }

  if (typeof value === 'string') {
    const match = value.match(/\b(19|20)\d{2}\b/)
    if (match) {
      return parseInt(match[0], 10)
    }
  }

  return null
}

function normaliseDoi(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const normalised = trimmed.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  const match = normalised.match(/10\.\d{4,9}\/[\w./:-]+/)
  if (!match) {
    return null
  }

  return match[0].replace(/[).,;]+$/, '')
}

function normaliseUrl(value: unknown, doi: string | null): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) {
      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/[).,;]+$/, '')
      }

      if (trimmed.startsWith('doi.org/')) {
        return `https://${trimmed}`
      }
    }
  }

  return doi ? `https://doi.org/${doi}` : null
}

function parseResearchResultsFallback(researchText: string, maxResults: number): ApiSearchResult[] {
  const papers: ApiSearchResult[] = []
  const titleRegex = /(?:Title:|Paper:|Study:)\s*"([^"]+)"/gi
  let titleMatch: RegExpExecArray | null
  let paperIndex = 0
  const baseTimestamp = Date.now()

  while ((titleMatch = titleRegex.exec(researchText)) !== null && paperIndex < maxResults) {
    const title = titleMatch[1].trim()
    if (!title || title.length < 10) continue

    const contextStart = Math.max(0, titleMatch.index - 200)
    const contextEnd = Math.min(researchText.length, titleMatch.index + 500)
    const context = researchText.slice(contextStart, contextEnd)

    const authors = extractAuthorsFromContext(context)
    const year = extractYearFromContext(context)
    const venue = extractVenueFromContext(context)
    const doi = extractDoiFromContext(context)

    papers.push({
      id: `research_${baseTimestamp}_${paperIndex}`,
      title,
      abstract: null,
      authors,
      year,
      venue,
      citationCount: null,
      semanticScholarId: '',
      arxivId: null,
      doi,
      url: doi ? `https://doi.org/${doi}` : null,
      source: 'perplexity_research'
    })

    paperIndex++
  }

  console.debug('Fallback parser produced papers', { count: papers.length })
  return papers
}

function extractAuthorsFromContext(context: string): string[] {
  const authorMatch = context.match(/(?:Authors?:|By:)\s*([^\n]+)/i)
  if (!authorMatch) return []

  const authorString = authorMatch[1].trim()
  // Split by common delimiters and clean up
  return authorString
    .split(/[,;&]/)
    .map(author => author.trim())
    .filter(author => author.length > 0 && author.length < 100)
    .slice(0, 10) // Limit to reasonable number of authors
}

function extractYearFromContext(context: string): number | null {
  const yearMatch = context.match(/\b(20\d{2}|19\d{2})\b/)
  return yearMatch ? parseInt(yearMatch[1]) : null
}

function extractVenueFromContext(context: string): string | null {
  const venueMatch = context.match(/(?:Journal:|Conference:|Published in:)\s*([^\n]+)/i)
  if (!venueMatch) return null

  const venue = venueMatch[1].trim()
  return venue.length > 0 && venue.length < 200 ? venue : null
}

function extractDoiFromContext(context: string): string | null {
  const doiMatch = context.match(/(?:DOI:|doi:|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d+\/[^\s]+)/i)
  return doiMatch ? doiMatch[1] : null
}

function generateListName(paper: ApiSearchResult): string {
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  const shortTitle = paper.title.length > 50
    ? paper.title.slice(0, 47) + '...'
    : paper.title

  return `Research: ${shortTitle} (${timestamp})`
}

function extractResearchSummary(researchText: string): string {
  // Extract first paragraph or first few sentences as summary
  const sentences = researchText.split(/[.!?]+/)
  const summary = sentences.slice(0, 3).join('. ').trim()

  return summary.length > 10
    ? summary + (summary.endsWith('.') ? '' : '.')
    : 'Deep research completed successfully.'
}

const PROMPT_HEADER_PATTERNS = [
  'target paper:',
  'authors:',
  'published in:',
  'research focus:',
  'task:',
  'output requirements:',
  'return the findings',
  'you are an assistant',
]

function sanitiseResearchSummary(summary: string | null | undefined): string | null {
  if (!summary) {
    return null
  }

  const cleanedLines = summary
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => {
      const lower = line.toLowerCase()
      return !PROMPT_HEADER_PATTERNS.some(pattern => lower.startsWith(pattern))
    })

  const cleaned = cleanedLines.join(' ').replace(/\s{2,}/g, ' ').trim()

  if (!cleaned) {
    return null
  }

  if (cleaned.length > 600) {
    return `${cleaned.slice(0, 597).trimEnd()}…`
  }

  return cleaned
}

function clampResults(requested?: number): number {
  if (!requested || Number.isNaN(requested)) {
    return 12
  }

  const normalised = Math.floor(requested)
  return Math.min(Math.max(normalised, 1), 25)
}
