const SEMANTIC_SCHOLAR_BASE = 'https://api.semanticscholar.org/graph/v1'
const SEMANTIC_SCHOLAR_FIELDS = [
  'title',
  'abstract',
  'authors',
  'year',
  'venue',
  'citationCount',
  'url',
  'externalIds',
  'openAccessPdf',
  'publicationDate',
].join(',')

const CROSSREF_ENDPOINT = 'https://api.crossref.org/works'
const PUBMED_EFETCH_ENDPOINT =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'

const DEFAULT_CONTACT = 'research@evidentia.local'
const DEFAULT_USER_AGENT = `EvidentiaWeeklyDigest/0.1 (mailto:${DEFAULT_CONTACT})`

const MAX_PAPERS = 12
const REQUEST_RETRY_DELAY_MS = 600

type ExternalIds = Record<string, string | string[] | null | undefined>

interface SemanticScholarAuthor {
  name?: string | null
}

interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract: string | null
  authors?: SemanticScholarAuthor[]
  year: number | null
  venue: string | null
  citationCount: number | null
  url: string | null
  externalIds?: ExternalIds
  openAccessPdf?: { url?: string | null } | null
  publicationDate: string | null
}

export type AbstractSource =
  | 'semantic_scholar'
  | 'crossref'
  | 'pubmed'
  | 'generated'

export interface WeeklyPaperCandidate {
  title: string
  semanticScholarId?: string | null
  doi?: string | null
  pmid?: string | null
  url?: string | null
  source?: string | null
  publicationDate?: string | null
}

export interface EnrichedWeeklyPaper {
  title: string
  abstract: string
  abstractSource: AbstractSource
  authors: string[]
  venue: string | null
  year: number | null
  citationCount: number | null
  url: string | null
  doi: string | null
  pmid: string | null
  semanticScholarId: string
  publicationDate: string | null
  externalIds?: ExternalIds
}

export interface EnrichOptions {
  fetchImpl?: typeof fetch
  maxPapers?: number
}

export interface AbstractResolution {
  abstract: string
  source: AbstractSource
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureUserAgent(): string {
  const configured = process.env.CROSSREF_USER_AGENT
  if (configured && configured.includes('mailto:')) {
    return configured
  }
  if (configured) {
    return `${configured} (mailto:${DEFAULT_CONTACT})`
  }
  return DEFAULT_USER_AGENT
}

function pickFirstString(value: string | string[] | null | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim()
      }
    }
  }
  return null
}

function extractDoi(externalIds: ExternalIds | undefined): string | null {
  if (!externalIds) {
    return null
  }
  const raw =
    pickFirstString(externalIds.DOI) ??
    pickFirstString(externalIds.doi) ??
    pickFirstString(externalIds.Doi)
  if (!raw) {
    return null
  }
  return raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
}

function extractPmid(externalIds: ExternalIds | undefined): string | null {
  if (!externalIds) {
    return null
  }
  return (
    pickFirstString(externalIds.PMID) ??
    pickFirstString(externalIds.pmid) ??
    pickFirstString(externalIds.Pmid) ??
    null
  )
}

function normaliseUrl(raw: string | null | undefined): string | null {
  if (!raw) {
    return null
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed)
    url.hash = ''
    if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '')
    }
    return url.toString()
  } catch (error) {
    return trimmed
  }
}

function sanitiseAbstract(text: string): string | null {
  const normalised = text
    .replace(/<\/?jats:[^>]+>/gi, ' ')
    .replace(/<br\s*\/?>(?=\S)/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()

  return normalised || null
}

function buildGeneratedAbstract(title: string): string {
  const cleaned = title.trim().replace(/\s+/g, ' ')
  if (!cleaned) {
    return "No abstract was supplied. This placeholder summarises the paper's focus based on its title."
  }
  return [
    'No abstract was supplied for this paper, so a short placeholder summary has been generated.',
    `The work titled "${cleaned}" appears to capture the main theme and is included so you can quickly scan its relevance.`,
  ].join(' ')
}

function mapAuthors(authors: SemanticScholarAuthor[] | undefined): string[] {
  if (!Array.isArray(authors)) {
    return []
  }

  return authors
    .map((author) => author?.name?.trim())
    .filter((name): name is string => Boolean(name))
}

async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  init?: RequestInit,
  retries = 1
): Promise<Response | null> {
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await fetchImpl(url, init)
      if (!response.ok && attempt < retries && (response.status === 429 || response.status >= 500)) {
        attempt++
        await sleep(REQUEST_RETRY_DELAY_MS * attempt)
        continue
      }
      return response
    } catch (error) {
      if (attempt >= retries) {
        return null
      }
      attempt++
      await sleep(REQUEST_RETRY_DELAY_MS * attempt)
    }
  }
}

async function fetchSemanticScholarPaper(
  identifier: string,
  fetchImpl: typeof fetch
): Promise<SemanticScholarPaper | null> {
  const url = `${SEMANTIC_SCHOLAR_BASE}/paper/${encodeURIComponent(identifier)}?fields=${SEMANTIC_SCHOLAR_FIELDS}`
  const response = await fetchWithRetry(url, fetchImpl, undefined, 2)
  if (!response || !response.ok) {
    return null
  }
  const payload = (await response.json().catch(() => null)) as SemanticScholarPaper | null
  if (!payload?.paperId) {
    return null
  }
  return payload
}

async function searchSemanticScholarPaper(
  title: string,
  fetchImpl: typeof fetch
): Promise<SemanticScholarPaper | null> {
  const params = new URLSearchParams({
    query: title,
    limit: '1',
    fields: SEMANTIC_SCHOLAR_FIELDS,
  })
  const response = await fetchWithRetry(
    `${SEMANTIC_SCHOLAR_BASE}/paper/search?${params.toString()}`,
    fetchImpl,
    undefined,
    1
  )
  if (!response || !response.ok) {
    return null
  }
  const payload = (await response.json().catch(() => null)) as { data?: SemanticScholarPaper[] } | null
  const [paper] = payload?.data ?? []
  return paper?.paperId ? paper : null
}

function buildSemanticScholarIdentifiers(candidate: WeeklyPaperCandidate): string[] {
  const identifiers: string[] = []
  if (candidate.semanticScholarId) {
    identifiers.push(candidate.semanticScholarId)
  }
  if (candidate.doi) {
    identifiers.push(`DOI:${candidate.doi}`)
  }
  if (candidate.pmid) {
    identifiers.push(`PMID:${candidate.pmid}`)
  }
  return identifiers
}

export async function fetchSemanticScholarDetails(
  candidate: WeeklyPaperCandidate,
  fetchImpl: typeof fetch = fetch
): Promise<SemanticScholarPaper | null> {
  for (const identifier of buildSemanticScholarIdentifiers(candidate)) {
    const paper = await fetchSemanticScholarPaper(identifier, fetchImpl)
    if (paper) {
      return paper
    }
  }

  if (candidate.title) {
    return searchSemanticScholarPaper(candidate.title, fetchImpl)
  }

  return null
}

async function fetchCrossrefAbstract(
  doi: string,
  fetchImpl: typeof fetch
): Promise<string | null> {
  const userAgent = ensureUserAgent()
  const response = await fetchWithRetry(
    `${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`,
    fetchImpl,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
    },
    1
  )
  if (!response || !response.ok) {
    return null
  }
  const payload = await response.json().catch(() => null)
  const abstract = typeof payload?.message?.abstract === 'string' ? payload.message.abstract : null
  return abstract ? sanitiseAbstract(abstract) : null
}

async function fetchPubmedAbstract(
  pmid: string,
  fetchImpl: typeof fetch
): Promise<string | null> {
  const userAgent = ensureUserAgent()
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmid,
    retmode: 'text',
    rettype: 'abstract',
  })
  const response = await fetchWithRetry(
    `${PUBMED_EFETCH_ENDPOINT}?${params.toString()}`,
    fetchImpl,
    {
      headers: {
        'User-Agent': userAgent,
      },
    },
    1
  )
  if (!response || !response.ok) {
    return null
  }
  const text = (await response.text().catch(() => '')).trim()
  if (!text) {
    return null
  }
  const clean = text.replace(/\s+/g, ' ')
  return clean || null
}

export async function resolveAbstractForPaper(
  paper: SemanticScholarPaper,
  fetchImpl: typeof fetch = fetch
): Promise<AbstractResolution> {
  const existing = typeof paper.abstract === 'string' ? paper.abstract.trim() : ''
  if (existing) {
    return {
      abstract: existing,
      source: 'semantic_scholar',
    }
  }

  const doi = extractDoi(paper.externalIds)
  if (doi) {
    const crossrefAbstract = await fetchCrossrefAbstract(doi, fetchImpl)
    if (crossrefAbstract) {
      return {
        abstract: crossrefAbstract,
        source: 'crossref',
      }
    }
  }

  const pmid = extractPmid(paper.externalIds)
  if (pmid) {
    const pubmedAbstract = await fetchPubmedAbstract(pmid, fetchImpl)
    if (pubmedAbstract) {
      return {
        abstract: pubmedAbstract,
        source: 'pubmed',
      }
    }
  }

  return {
    abstract: buildGeneratedAbstract(paper.title || 'Untitled'),
    source: 'generated',
  }
}

function buildDedupKey({
  doi,
  url,
  semanticScholarId,
}: {
  doi: string | null
  url: string | null
  semanticScholarId: string
}): string {
  if (doi) {
    return `doi:${doi.toLowerCase()}`
  }
  if (url) {
    return `url:${url}`
  }
  return `id:${semanticScholarId}`
}

export async function enrichWeeklyDigestPapers(
  candidates: WeeklyPaperCandidate[],
  options: EnrichOptions = {}
): Promise<EnrichedWeeklyPaper[]> {
  if (!Array.isArray(candidates) || !candidates.length) {
    return []
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const limit = Math.max(1, Math.min(options.maxPapers ?? MAX_PAPERS, MAX_PAPERS))

  const enriched: EnrichedWeeklyPaper[] = []
  const dedup = new Set<string>()

  for (const candidate of candidates) {
    if (enriched.length >= limit) {
      break
    }

    const details = await fetchSemanticScholarDetails(candidate, fetchImpl)
    if (!details) {
      continue
    }

    const { abstract, source } = await resolveAbstractForPaper(details, fetchImpl)
    const doi = extractDoi(details.externalIds)
    const pmid = extractPmid(details.externalIds)
    const semanticScholarId = details.paperId
    const url = normaliseUrl(details.url) ?? normaliseUrl(details.openAccessPdf?.url) ?? normaliseUrl(candidate.url)
    const key = buildDedupKey({ doi, url, semanticScholarId })

    if (dedup.has(key)) {
      continue
    }
    dedup.add(key)

    enriched.push({
      title: details.title,
      abstract,
      abstractSource: source,
      authors: mapAuthors(details.authors).slice(0, 3),
      venue: details.venue ?? null,
      year: typeof details.year === 'number' ? details.year : null,
      citationCount: typeof details.citationCount === 'number' ? details.citationCount : null,
      url,
      doi,
      pmid,
      semanticScholarId,
      publicationDate: details.publicationDate ?? candidate.publicationDate ?? null,
      externalIds: details.externalIds,
    })
  }

  return enriched
}
