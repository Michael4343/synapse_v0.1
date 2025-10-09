import type { PerplexityPaperCandidate } from './perplexity'

const SEMANTIC_SCHOLAR_BASE = 'https://api.semanticscholar.org/graph/v1'
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
  'publicationDate',
].join(',')

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
  publicationDate: string | null
}

export interface EnrichedPaper {
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

function normaliseDoi(raw?: string | null | string[]): string | null {
  if (!raw) {
    return null
  }

  const value = Array.isArray(raw) ? raw.find(Boolean) : raw
  if (!value || typeof value !== 'string') {
    return null
  }

  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim() || null
}

function extractDoiFromUrl(url?: string): string | null {
  if (!url) {
    return null
  }

  const match = url.match(/doi\.org\/([^?#]+)/i)
  return match ? decodeURIComponent(match[1]) : null
}

function extractArxivId(candidate: PerplexityPaperCandidate): string | null {
  if (!candidate.url) {
    return null
  }

  const match = candidate.url.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+)/i)
  return match ? match[1] : null
}

async function fetchSemanticScholarPaperById(id: string): Promise<SemanticScholarPaper | null> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY

  const response = await fetch(
    `${SEMANTIC_SCHOLAR_BASE}/paper/${encodeURIComponent(id)}?fields=${SEMANTIC_SCHOLAR_FIELDS}`,
    {
      headers: {
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        'Accept': 'application/json',
      }
    }
  )

  if (!response.ok) {
    return null
  }

  const paper = (await response.json().catch(() => null)) as SemanticScholarPaper | null
  if (!paper?.paperId) {
    return null
  }

  return paper
}

async function searchSemanticScholarByTitle(title: string): Promise<SemanticScholarPaper | null> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY

  const params = new URLSearchParams({
    query: title,
    fields: SEMANTIC_SCHOLAR_FIELDS,
    limit: '1',
  })

  const response = await fetch(`${SEMANTIC_SCHOLAR_BASE}/paper/search?${params.toString()}`, {
    headers: {
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'Accept': 'application/json',
    }
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: SemanticScholarPaper[] }
    | null

  const [paper] = payload?.data ?? []
  return paper?.paperId ? paper : null
}

function mapAuthors(authors?: SemanticScholarAuthor[]): string[] {
  if (!Array.isArray(authors)) {
    return []
  }

  return authors
    .map((author) => author?.name?.trim())
    .filter((name): name is string => Boolean(name))
}

function coerceUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) {
      continue
    }
    try {
      const url = new URL(value)
      return url.toString()
    } catch (error) {
      if (value.startsWith('http')) {
        return value
      }
    }
  }
  return null
}

export async function enrichPerplexityCandidate(
  candidate: PerplexityPaperCandidate
): Promise<EnrichedPaper | null> {
  const doiFromCandidate = candidate.doi ?? extractDoiFromUrl(candidate.url)
  const arxivId = extractArxivId(candidate)

  let paper: SemanticScholarPaper | null = null

  if (doiFromCandidate) {
    paper = await fetchSemanticScholarPaperById(doiFromCandidate)
  }

  if (!paper && arxivId) {
    paper = await fetchSemanticScholarPaperById(arxivId)
  }

  if (!paper && candidate.title) {
    paper = await searchSemanticScholarByTitle(candidate.title)
  }

  if (!paper) {
    return null
  }

  const doi =
    normaliseDoi(
      (paper.externalIds &&
        (paper.externalIds['DOI'] ?? paper.externalIds['doi'] ?? paper.externalIds['Doi'])) ||
        null
    ) ?? doiFromCandidate ?? null
  const semanticScholarId = paper.paperId
  const rawArxiv =
    paper.externalIds &&
    (paper.externalIds['ArXiv'] ?? paper.externalIds['arXiv'] ?? paper.externalIds['ARXIV'])
  const resolvedArxivId =
    typeof rawArxiv === 'string'
      ? rawArxiv
      : Array.isArray(rawArxiv)
        ? rawArxiv[0]
        : arxivId

  return {
    id: semanticScholarId,
    title: paper.title,
    abstract: paper.abstract,
    authors: mapAuthors(paper.authors),
    year: paper.year ?? null,
    venue: paper.venue ?? null,
    citationCount: paper.citationCount ?? null,
    semanticScholarId,
    arxivId: resolvedArxivId ?? null,
    doi,
    url: coerceUrl(paper.url, paper.openAccessPdf?.url, candidate.url),
    source: 'perplexity_semantic_scholar',
    publicationDate: paper.publicationDate ?? candidate.publicationDate ?? null,
  }
}
