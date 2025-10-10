const DAY_MS = 24 * 60 * 60 * 1000
const SEMANTIC_SCHOLAR_BASE = 'https://api.semanticscholar.org/graph/v1'
const SEMANTIC_SCHOLAR_BULK_ENDPOINT = `${SEMANTIC_SCHOLAR_BASE}/paper/search/bulk`
const SEMANTIC_SCHOLAR_FIELDS = [
  'paperId',
  'title',
  'abstract',
  'authors',
  'url',
  'venue',
  'year',
  'publicationDate',
  'externalIds',
  'openAccessPdf'
].join(',')

const MAX_RESULTS_PER_PAGE = 100
const MAX_PAGES = 3
const MAX_TOTAL_RESULTS = 200
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const SEMANTIC_SCHOLAR_DELAY_MS = 1100 // Respect 1 req/sec guidance for API key holders
export const SCRAPER_DELAY_MS = SEMANTIC_SCHOLAR_DELAY_MS // Backwards compatibility with existing imports

interface SemanticScholarAuthor {
  name?: string | null
}

interface SemanticScholarExternalIds {
  DOI?: string | string[] | null
  doi?: string | string[] | null
  Doi?: string | string[] | null
  ArXiv?: string | string[] | null
  arXiv?: string | string[] | null
  ARXIV?: string | string[] | null
  [key: string]: string | string[] | null | undefined
}

interface SemanticScholarPaper {
  paperId?: string | null
  title?: string | null
  abstract?: string | null
  authors?: SemanticScholarAuthor[]
  url?: string | null
  venue?: string | null
  year?: number | null
  citationCount?: number | null
  publicationDate?: string | null
  externalIds?: SemanticScholarExternalIds | null
  openAccessPdf?: { url?: string | null } | null
}

interface SemanticScholarBulkResponse {
  data?: SemanticScholarPaper[]
  next?: string | null
  token?: string | null
}

export interface ScholarPaper {
  title: string
  url: string | null
  snippet: string | null
  authors: string | null
  source: string | null
  publication_date: string | null
  raw_publication_date: string | null
}

export function uniqueKeywords(keywords: string[]): string[] {
  if (!Array.isArray(keywords)) {
    return []
  }

  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of keywords) {
    if (!raw) {
      continue
    }

    const keyword = raw.trim()
    if (!keyword) {
      continue
    }

    const normalised = keyword.toLowerCase()
    if (seen.has(normalised)) {
      continue
    }

    seen.add(normalised)
    result.push(keyword)
  }

  return result
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function pickFirstString(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim()
      }
    }
    return null
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normaliseDoi(raw?: unknown): string | null {
  const value = pickFirstString(raw)
  if (!value) {
    return null
  }

  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim() || null
}

function coerceUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed) {
      continue
    }

    try {
      const url = new URL(trimmed)
      return url.toString()
    } catch (error) {
      if (trimmed.startsWith('http')) {
        return trimmed
      }
    }
  }

  return null
}

function mapAuthors(authors?: SemanticScholarAuthor[]): string | null {
  if (!Array.isArray(authors)) {
    return null
  }

  const names = authors
    .map((author) => author?.name?.trim())
    .filter((name): name is string => Boolean(name))

  if (!names.length) {
    return null
  }

  return names.join(', ')
}

function truncateAbstract(abstract?: string | null): string | null {
  if (!abstract) {
    return null
  }

  const normalised = abstract.replace(/\s+/g, ' ').trim()

  if (!normalised) {
    return null
  }

  if (normalised.length <= 600) {
    return normalised
  }

  return `${normalised.slice(0, 597)}…`
}

function parsePublicationDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (ISO_DATE_REGEX.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00Z`)
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function resolvePublicationDate(paper: SemanticScholarPaper): { iso: string | null; raw: string | null } {
  const parsed = parsePublicationDate(paper.publicationDate)

  if (parsed) {
    return { iso: parsed.toISOString(), raw: paper.publicationDate }
  }

  const rawFallback = paper.publicationDate ?? (typeof paper.year === 'number' ? String(paper.year) : null)
  return { iso: null, raw: rawFallback }
}

function resolveUrl(paper: SemanticScholarPaper): string | null {
  const externalIds = paper.externalIds || {}
  const doi =
    normaliseDoi(externalIds.DOI ?? externalIds.doi ?? externalIds.Doi) ||
    normaliseDoi(externalIds['CrossRef'] ?? externalIds['crossref'])
  const doiUrl = doi ? `https://doi.org/${doi}` : null

  const arxivId = pickFirstString(externalIds.ArXiv ?? externalIds.arXiv ?? externalIds.ARXIV)
  const arxivUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : null

  const semanticScholarUrl = paper.paperId
    ? `https://www.semanticscholar.org/paper/${encodeURIComponent(paper.paperId)}`
    : null

  return coerceUrl(paper.url, paper.openAccessPdf?.url, doiUrl, arxivUrl, semanticScholarUrl)
}

function mapPaper(paper: SemanticScholarPaper): ScholarPaper | null {
  const title = paper.title?.trim()
  if (!title) {
    return null
  }

  const { iso, raw } = resolvePublicationDate(paper)
  if (!iso) {
    return null
  }

  return {
    title,
    url: resolveUrl(paper),
    snippet: truncateAbstract(paper.abstract),
    authors: mapAuthors(paper.authors),
    source: paper.venue?.trim() || 'Semantic Scholar',
    publication_date: iso,
    raw_publication_date: raw
  }
}

function isWithinWindow(date: Date | null, windowMs: number): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false
  }

  const now = Date.now()
  const diff = now - date.getTime()
  return diff >= 0 && diff <= windowMs
}

async function fetchWithRetry(url: string, headers: Record<string, string>, attempt = 1): Promise<Response> {
  const response = await fetch(url, { headers })

  if (response.ok) {
    return response
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 15000)
    console.warn(
      `[semantic-scholar] Request failed with ${response.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/5)`
    )
    await delay(backoff)
    return fetchWithRetry(url, headers, attempt + 1)
  }

  const body = await response.text().catch(() => '')
  throw new Error(`Semantic Scholar request failed (${response.status}): ${body}`)
}

export async function fetchPapersForKeyword(
  keyword: string,
  semanticScholarApiKey: string,
  windowDays = 30
): Promise<ScholarPaper[]> {
  const trimmedKeyword = keyword.trim()
  if (!trimmedKeyword) {
    return []
  }

  const userAgent =
    process.env.SEMANTIC_SCHOLAR_USER_AGENT ||
    'EvidentiaPersonalFeed/0.1 (contact: research@evidentia.local)'

  const windowMs = Math.max(windowDays, 0) * DAY_MS
  const startDate = formatDate(new Date(Date.now() - windowMs))
  const endDate = formatDate(new Date())

  console.log(`[semantic-feed] Fetching papers for "${trimmedKeyword}" (window ${windowDays}d)`)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': userAgent
  }

  if (semanticScholarApiKey) {
    headers['x-api-key'] = semanticScholarApiKey
  }

  const seen = new Set<string>()
  const collected: ScholarPaper[] = []
  let nextToken: string | null = null
  let page = 0

  while (page < MAX_PAGES && collected.length < MAX_TOTAL_RESULTS) {
    const remaining = MAX_TOTAL_RESULTS - collected.length
    const limit = Math.min(MAX_RESULTS_PER_PAGE, Math.max(remaining, 1))

    const params = new URLSearchParams({
      query: trimmedKeyword,
      fields: SEMANTIC_SCHOLAR_FIELDS,
      limit: String(limit),
      sort: 'publicationDate:desc',
      publicationDate: `${startDate}-${endDate}`
    })

    if (nextToken) {
      params.set('next', nextToken)
    }

    const requestUrl = `${SEMANTIC_SCHOLAR_BULK_ENDPOINT}?${params.toString()}`
    const response = await fetchWithRetry(requestUrl, headers)
    const payload = (await response.json()) as SemanticScholarBulkResponse
    const papers = Array.isArray(payload.data) ? payload.data : []

    console.log(
      `[semantic-feed] Received ${papers.length} result(s) for "${trimmedKeyword}" (page ${page + 1})`
    )

    for (const paper of papers) {
      const mapped = mapPaper(paper)
      if (!mapped) {
        continue
      }

      const publicationDate = mapped.publication_date ? new Date(mapped.publication_date) : null
      if (!isWithinWindow(publicationDate, windowMs)) {
        continue
      }

      const dedupeKey = (mapped.url || mapped.title).toLowerCase()
      if (seen.has(dedupeKey)) {
        continue
      }

      seen.add(dedupeKey)
      collected.push(mapped)
    }

    const token =
      typeof payload.next === 'string'
        ? payload.next
        : typeof payload.token === 'string'
          ? payload.token
          : null

    nextToken = token
    page += 1

    if (!nextToken) {
      break
    }

    await delay(SEMANTIC_SCHOLAR_DELAY_MS)
  }

  collected.sort((a, b) => {
    const aTime = a.publication_date ? new Date(a.publication_date).getTime() : -Infinity
    const bTime = b.publication_date ? new Date(b.publication_date).getTime() : -Infinity
    return bTime - aTime
  })

  console.log(`[semantic-feed] Returning ${collected.length} paper(s) for "${trimmedKeyword}"`)

  return collected
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { DAY_MS as FETCH_WINDOW_MS }
