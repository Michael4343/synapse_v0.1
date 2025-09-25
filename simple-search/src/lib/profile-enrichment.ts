import { DEFAULT_PROFILE_PERSONALIZATION, ProfilePersonalization, TopicCluster } from './profile-types'

const DEFAULT_MODEL = process.env.PROFILE_ENRICHMENT_MODEL || 'gemini-2.5-flash'

interface OrcidWork {
  title?: string
  abstract?: string
  journal?: string
  year?: number
  contributors?: string[]
}

interface GenerateProfileInput {
  manualKeywords?: string[]
  resumeText?: string
  orcidWorks?: OrcidWork[]
  existingPersonalization?: ProfilePersonalization | null
}

interface GenerateProfileOutput {
  personalization: ProfilePersonalization
  modelVersion: string
  rawResponse?: unknown
  usedFallback: boolean
  message?: string
}

export async function generateProfilePersonalization({
  manualKeywords = [],
  resumeText,
  orcidWorks = [],
  existingPersonalization,
}: GenerateProfileInput): Promise<GenerateProfileOutput> {
  const fallback = buildFallbackPersonalization({ manualKeywords, orcidWorks, existingPersonalization })
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return {
      personalization: fallback,
      modelVersion: 'fallback/manual-keywords',
      usedFallback: true,
      message: 'GEMINI_API_KEY not configured; using heuristic profile.'
    }
  }

  try {
    const response = await callGeminiForProfile({ manualKeywords, resumeText, orcidWorks, existingPersonalization, apiKey })
    const personalization = applyManualKeywordFocus(normalisePersonalization(response), manualKeywords)

    if (!personalization.topic_clusters.length) {
      return {
        personalization: fallback,
        modelVersion: `${DEFAULT_MODEL}-empty-clusters`,
        rawResponse: response,
        usedFallback: true,
        message: 'LLM response missing topic clusters; using fallback.'
      }
    }

    return {
      personalization,
      modelVersion: `${DEFAULT_MODEL}-v1`,
      rawResponse: response,
      usedFallback: false,
    }
  } catch (error) {
    console.error('Profile LLM generation failed', error)
    return {
      personalization: fallback,
      modelVersion: `${DEFAULT_MODEL}-error-fallback`,
      usedFallback: true,
      message: error instanceof Error ? error.message : 'Unknown LLM error'
    }
  }
}

interface LlmPayload {
  topic_clusters?: Array<Partial<TopicCluster>>
  author_focus?: Array<{ name?: string; affiliation?: string; relation?: string; priority?: number; source?: string }>
  venue_focus?: Array<{ name?: string; type?: string; priority?: number; source?: string }>
  filters?: {
    recency_days?: number
    publication_types?: string[]
    include_preprints?: boolean
  }
}

function normalisePersonalization(payload: LlmPayload): ProfilePersonalization {
  const personalization: ProfilePersonalization = {
    topic_clusters: [],
    author_focus: [],
    venue_focus: [],
    filters: {
      ...DEFAULT_PROFILE_PERSONALIZATION.filters,
    },
  }

  const clusters = Array.isArray(payload.topic_clusters) ? payload.topic_clusters : []
  personalization.topic_clusters = clusters
    .map((cluster, index) => {
      const keywords = Array.isArray(cluster.keywords) ? cluster.keywords.filter(Boolean).map(String) : []
      if (!keywords.length && !cluster.label) {
        return null
      }
      return {
        id: cluster.id || `cluster-${index + 1}`,
        label: cluster.label || keywords[0] || `Cluster ${index + 1}`,
        keywords,
        synonyms: Array.isArray(cluster.synonyms) ? cluster.synonyms.filter(Boolean).map(String) : [],
        methods: Array.isArray(cluster.methods) ? cluster.methods.filter(Boolean).map(String) : [],
        applications: Array.isArray(cluster.applications) ? cluster.applications.filter(Boolean).map(String) : [],
        priority: typeof cluster.priority === 'number' ? cluster.priority : index + 1,
        source: (cluster.source === 'manual' || cluster.source === 'orcid' ? cluster.source : 'llm') as 'llm' | 'manual' | 'orcid',
        rationale: cluster.rationale ? String(cluster.rationale) : undefined,
      }
    })
    .filter((cluster): cluster is TopicCluster => Boolean(cluster))

  if (!personalization.topic_clusters.length) {
    personalization.topic_clusters = DEFAULT_PROFILE_PERSONALIZATION.topic_clusters
  }

  const authorFocus = Array.isArray(payload.author_focus) ? payload.author_focus : []
  personalization.author_focus = authorFocus
    .map((author, index) => {
      if (!author?.name) {
        return null
      }
      const relation = author.relation === 'self' || author.relation === 'collaborator' || author.relation === 'inspiration'
        ? author.relation
        : 'collaborator'
      const source = author.source === 'manual' || author.source === 'orcid' ? author.source : 'llm'
      return {
        name: String(author.name),
        affiliation: author.affiliation ? String(author.affiliation) : undefined,
        relation,
        priority: typeof author.priority === 'number' ? author.priority : index + 1,
        source,
      }
    })
    .filter((author): author is ProfilePersonalization['author_focus'][number] => Boolean(author))

  const venueFocus = Array.isArray(payload.venue_focus) ? payload.venue_focus : []
  personalization.venue_focus = venueFocus
    .map((venue, index) => {
      if (!venue?.name) {
        return null
      }
      const type = venue.type === 'journal' || venue.type === 'conference' || venue.type === 'workshop' || venue.type === 'preprint-server'
        ? venue.type
        : undefined
      const source = venue.source === 'manual' || venue.source === 'orcid' ? venue.source : 'llm'
      return {
        name: String(venue.name),
        type,
        priority: typeof venue.priority === 'number' ? venue.priority : index + 1,
        source,
      }
    })
    .filter((venue): venue is ProfilePersonalization['venue_focus'][number] => Boolean(venue))

  if (payload.filters) {
    personalization.filters = {
      recency_days: typeof payload.filters.recency_days === 'number' ? Math.max(1, payload.filters.recency_days) : DEFAULT_PROFILE_PERSONALIZATION.filters.recency_days,
      publication_types: Array.isArray(payload.filters.publication_types)
        ? payload.filters.publication_types
            .map((type) => {
              if (type === 'journal' || type === 'conference' || type === 'preprint' || type === 'dataset' || type === 'patent') {
                return type
              }
              return null
            })
            .filter((type): type is ProfilePersonalization['filters']['publication_types'][number] => Boolean(type))
        : DEFAULT_PROFILE_PERSONALIZATION.filters.publication_types,
      include_preprints: payload.filters.include_preprints ?? DEFAULT_PROFILE_PERSONALIZATION.filters.include_preprints,
    }
  }

  return personalization
}

function buildFallbackPersonalization({
  manualKeywords,
  orcidWorks,
  existingPersonalization,
}: {
  manualKeywords: string[]
  orcidWorks: OrcidWork[]
  existingPersonalization?: ProfilePersonalization | null
}): ProfilePersonalization {
  const keywords = dedupeStrings([
    ...manualKeywords,
    ...extractTopKeywordsFromWorks(orcidWorks),
  ])

  const base: ProfilePersonalization = existingPersonalization
    ? {
        ...DEFAULT_PROFILE_PERSONALIZATION,
        ...existingPersonalization,
        topic_clusters: [...existingPersonalization.topic_clusters],
        author_focus: [...(existingPersonalization.author_focus ?? [])],
        venue_focus: [...(existingPersonalization.venue_focus ?? [])],
        filters: {
          ...DEFAULT_PROFILE_PERSONALIZATION.filters,
          ...(existingPersonalization.filters ?? {}),
        },
      }
    : {
        ...DEFAULT_PROFILE_PERSONALIZATION,
        topic_clusters: [],
        author_focus: [],
        venue_focus: [],
      }

  if (keywords.length) {
    base.topic_clusters = keywords.slice(0, 5).map((keyword, index) => ({
      id: `manual-${index + 1}`,
      label: titleCase(keyword),
      keywords: [keyword],
      priority: index + 1,
      source: 'manual',
    }))
  } else if (!base.topic_clusters.length) {
    base.topic_clusters = DEFAULT_PROFILE_PERSONALIZATION.topic_clusters
  }

  return base
}

function applyManualKeywordFocus(personalization: ProfilePersonalization, manualKeywords: string[]): ProfilePersonalization {
  const keywords = dedupeStrings(manualKeywords)
  if (!keywords.length) {
    return personalization
  }

  const clusters: TopicCluster[] = personalization.topic_clusters ? [...personalization.topic_clusters] : []
  const seenIds = new Set<string>()

  for (const cluster of clusters) {
    if (cluster.id) {
      seenIds.add(cluster.id)
    }
  }

  const ensureKeywordInCluster = (cluster: TopicCluster, keyword: string) => {
    const lower = keyword.toLowerCase()
    if (!cluster.keywords.some((value) => value.toLowerCase() === lower)) {
      cluster.keywords = [keyword, ...cluster.keywords]
    }
    cluster.source = 'manual'
  }

  const findClusterByKeyword = (keyword: string) => {
    const lower = keyword.toLowerCase()
    return clusters.find((cluster) => {
      if (cluster.label.toLowerCase() === lower) {
        return true
      }
      if (cluster.keywords.some((value) => value.toLowerCase() === lower)) {
        return true
      }
      if (cluster.synonyms && cluster.synonyms.some((value) => value.toLowerCase() === lower)) {
        return true
      }
      return false
    })
  }

  const manualClusters: TopicCluster[] = []
  let manualPosition = 0

  for (const keyword of keywords) {
    const existing = findClusterByKeyword(keyword)
    manualPosition += 1
    if (existing) {
      if (manualClusters.includes(existing)) {
        existing.priority = manualPosition
        ensureKeywordInCluster(existing, keyword)
        continue
      }
      ensureKeywordInCluster(existing, keyword)
      existing.priority = manualPosition
      manualClusters.push(existing)
    } else {
      const id = `manual-${manualPosition}`
      // Keep id unique if manual keywords change often.
      const uniqueId = seenIds.has(id) ? `${id}-${Date.now()}` : id
      seenIds.add(uniqueId)
      manualClusters.push({
        id: uniqueId,
        label: titleCase(keyword),
        keywords: [keyword],
        synonyms: [],
        methods: [],
        applications: [],
        priority: manualPosition,
        source: 'manual',
      })
    }
  }

  const remainingClusters = clusters.filter((cluster) => !manualClusters.includes(cluster))

  const combined = [...manualClusters, ...remainingClusters]

  combined.forEach((cluster, index) => {
    cluster.priority = index + 1
  })

  personalization.topic_clusters = combined
  return personalization
}

function extractTopKeywordsFromWorks(works: OrcidWork[]): string[] {
  const keywordScores = new Map<string, number>()

  for (const work of works) {
    const text = [work.title, work.abstract, work.journal].filter(Boolean).join(' ')
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9#+-]+/)
      .filter((token) => token.length > 3)

    for (const token of tokens) {
      keywordScores.set(token, (keywordScores.get(token) ?? 0) + 1)
    }
  }

  return Array.from(keywordScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keyword]) => keyword)
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function callGeminiForProfile({
  manualKeywords,
  resumeText,
  orcidWorks,
  existingPersonalization,
  apiKey,
}: GenerateProfileInput & { apiKey: string }): Promise<LlmPayload> {
  const worksSummary = orcidWorks.slice(0, 20).map((work, index) => ({
    index: index + 1,
    title: work.title,
    abstract: work.abstract,
    journal: work.journal,
    year: work.year,
    contributors: work.contributors,
  }))

  const userContext = {
    manualKeywords,
    resumeText,
    existingPersonalization,
    works: worksSummary,
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'profile_personalization',
          schema: {
            type: 'object',
            properties: {
              topic_clusters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    keywords: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 1,
                    },
                    synonyms: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    methods: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    applications: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    priority: { type: 'integer' },
                    source: {
                      type: 'string',
                      enum: ['llm', 'manual', 'orcid'],
                    },
                    rationale: { type: 'string' },
                  },
                  required: ['label', 'keywords'],
                },
                minItems: 3,
                maxItems: 8,
              },
              author_focus: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    affiliation: { type: 'string' },
                    relation: {
                      type: 'string',
                      enum: ['self', 'collaborator', 'inspiration'],
                    },
                    priority: { type: 'integer' },
                    source: {
                      type: 'string',
                      enum: ['llm', 'manual', 'orcid'],
                    },
                  },
                  required: ['name'],
                },
                maxItems: 6,
              },
              venue_focus: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: {
                      type: 'string',
                      enum: ['journal', 'conference', 'workshop', 'preprint-server'],
                    },
                    priority: { type: 'integer' },
                    source: {
                      type: 'string',
                      enum: ['llm', 'manual', 'orcid'],
                    },
                  },
                  required: ['name'],
                },
                maxItems: 6,
              },
              filters: {
                type: 'object',
                properties: {
                  recency_days: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 14,
                  },
                  publication_types: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['journal', 'conference', 'preprint', 'dataset', 'patent'],
                    },
                    minItems: 1,
                    maxItems: 5,
                  },
                  include_preprints: { type: 'boolean' },
                },
              },
            },
            required: ['topic_clusters', 'filters'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: 'You are an assistant that converts research activity data into structured personalization settings for a scientific literature feed. Prefer recent topics and ensure outputs help craft Semantic Scholar queries.',
        },
        {
          role: 'user',
          content: `Create a personalization profile from the following JSON context. The profile should focus on daily discovery of 12 fresh papers. Respond with JSON only.\n\n${JSON.stringify(userContext).slice(0, 12000)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`Gemini profile request failed: ${response.status} ${errorPayload}`)
  }

  const payload = await response.json()
  const message = payload?.choices?.[0]?.message?.content
  if (!message) {
    throw new Error('Gemini profile response missing message content')
  }

  try {
    return JSON.parse(message)
  } catch (error) {
    throw new Error('Failed to parse Gemini profile response JSON')
  }
}

export async function fetchOrcidWorks(orcidId: string): Promise<OrcidWork[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  const url = `https://pub.orcid.org/v3.0/${encodeURIComponent(orcidId)}/works`

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`ORCID API responded with ${response.status}`)
    }

    const payload = await response.json()
    const groups = Array.isArray(payload?.group) ? payload.group : []

    const works: OrcidWork[] = []

    for (const group of groups) {
      const summaries = Array.isArray(group['work-summary']) ? group['work-summary'] : []
      for (const summary of summaries) {
        const title = summary?.title?.title?.value
        const journal = summary?.journalTitle?.value
        const year = parseInt(summary?.publicationDate?.year?.value, 10)
        const contributors = Array.isArray(summary?.contributors?.contributor)
          ? summary.contributors.contributor
              .map((contributor: any) => contributor?.creditName?.value)
              .filter(Boolean)
          : undefined

        works.push({
          title: title || undefined,
          journal: journal || undefined,
          year: Number.isFinite(year) ? year : undefined,
          contributors,
        })
      }
    }

    return works
  } catch (error) {
    console.error('Failed to fetch ORCID works', error)
    return []
  } finally {
    clearTimeout(timeout)
  }
}
