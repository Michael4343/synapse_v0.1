const CROSSREF_ENDPOINT = 'https://api.crossref.org/works'
const CONTACT_EMAIL = 'research@evidentia.local'

type ExternalIds = Record<string, string | string[] | null | undefined>

function ensureContactInUserAgent(userAgent: string): string {
  const trimmed = userAgent.trim()
  if (!trimmed) {
    return `EvidentiaAcademicAggregator/0.1 (mailto: ${CONTACT_EMAIL})`
  }

  return trimmed.includes('mailto:') ? trimmed : `${trimmed} (mailto: ${CONTACT_EMAIL})`
}

function extractDoi(externalIds?: ExternalIds): string | null {
  if (!externalIds) {
    return null
  }

  const raw = externalIds.DOI ?? externalIds.doi ?? externalIds.Doi ?? null
  const value = Array.isArray(raw) ? raw.find(Boolean) ?? null : raw

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
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
    .trim()

  return normalised || null
}

async function fetchAbstractFromCrossref(doi: string, userAgent: string): Promise<string | null> {
  const response = await fetch(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': ensureContactInUserAgent(userAgent),
    },
  })

  if (!response.ok) {
    return null
  }

  const payload = await response.json().catch(() => null)
  const rawAbstract = typeof payload?.message?.abstract === 'string' ? payload.message.abstract : null
  return rawAbstract ? sanitiseAbstract(rawAbstract) : null
}

export interface SemanticScholarLikePaper {
  abstract: string | null
  externalIds?: ExternalIds
}

export async function hydrateSemanticScholarAbstracts<T extends SemanticScholarLikePaper>(
  papers: T[],
  userAgent: string
): Promise<T[]> {
  if (!papers.length) {
    return papers
  }

  const doiToIndexes = new Map<string, number[]>()

  papers.forEach((paper, index) => {
    const existingAbstract = typeof paper.abstract === 'string' ? paper.abstract.trim() : ''
    if (existingAbstract) {
      return
    }

    const doi = extractDoi(paper.externalIds)
    if (!doi) {
      return
    }

    const key = doi.toLowerCase()
    const bucket = doiToIndexes.get(key)
    if (bucket) {
      bucket.push(index)
    } else {
      doiToIndexes.set(key, [index])
    }
  })

  if (!doiToIndexes.size) {
    return papers
  }

  const updatedPapers = [...papers]

  for (const [doiKey, indexes] of doiToIndexes.entries()) {
    try {
      const abstract = await fetchAbstractFromCrossref(doiKey, userAgent)
      if (!abstract) {
        continue
      }

      indexes.forEach((index) => {
        const paper = papers[index]
        updatedPapers[index] = { ...paper, abstract }
      })
    } catch (error) {
      console.warn('Crossref abstract fetch failed', { doi: doiKey, error })
    }
  }

  return updatedPapers
}

