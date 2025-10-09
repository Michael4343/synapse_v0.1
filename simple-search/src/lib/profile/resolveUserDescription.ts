import type { ProfilePersonalization } from '@/lib/profile-types'

export type DescriptionSource =
  | 'profile_bio'
  | 'search_queries'
  | 'manual_keywords'
  | 'orcid_profile'
  | 'fallback'

export interface OrcidSignals {
  keywords?: string[] | null
  works?: Array<{ title?: string | null; journal?: string | null }> | null
}

export interface ResolveUserDescriptionInput {
  profileBio?: string | null
  profilePersonalization?: ProfilePersonalization | null
  searchQueries?: string[] | null
  orcid?: OrcidSignals | null
  fallbackText?: string | null
}

export interface ResolvedUserDescription {
  description: string
  source: DescriptionSource
  isFallback: boolean
}

const MIN_MEANINGFUL_LENGTH = 24
const FALLBACK_DESCRIPTION =
  'Curious researcher exploring emerging scholarship across disciplines.'

function normaliseString(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function isMeaningful(text: string | null | undefined): text is string {
  if (!text) {
    return false
  }
  const normalised = normaliseString(text)
  return normalised.length >= MIN_MEANINGFUL_LENGTH
}

function uniqueList(values: string[], limit = 4): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  for (const raw of values) {
    const normalised = normaliseString(raw)
    if (!normalised) {
      continue
    }
    const key = normalised.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(normalised)
    if (output.length === limit) {
      break
    }
  }

  return output
}

function formatList(values: string[]): string {
  if (values.length === 0) {
    return ''
  }
  if (values.length === 1) {
    return values[0]
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function describeQueries(queries: string[]): string {
  const formatted = formatList(queries)
  return `Actively tracking new work on ${formatted}.`
}

function describeManualKeywords(keywords: string[]): string {
  const formatted = formatList(keywords)
  return `Focused on ${formatted}.`
}

function deriveOrcidDescription(orcid: OrcidSignals | null | undefined): string | null {
  if (!orcid) {
    return null
  }

  const keywordList = uniqueList(orcid.keywords ?? [])
  if (keywordList.length) {
    return `ORCID profile emphasises ${formatList(keywordList)}.`
  }

  const works = Array.isArray(orcid.works) ? orcid.works : []
  const titles = uniqueList(
    works
      .map((work) => work?.title ?? work?.journal ?? null)
      .filter((value): value is string => Boolean(value)),
    3
  )

  if (titles.length) {
    const sample = titles.map((title) => `"${title}"`)
    return `ORCID profile highlights publications like ${formatList(sample)}.`
  }

  return null
}

export function resolveUserDescription(
  input: ResolveUserDescriptionInput
): ResolvedUserDescription {
  const profileBio = normaliseString(input.profileBio ?? '')
  if (isMeaningful(profileBio)) {
    return { description: profileBio, source: 'profile_bio', isFallback: false }
  }

  const manualKeywordCandidates = [
    ...(input.profilePersonalization?.manual_keywords ?? []),
    ...(
      input.profilePersonalization?.topic_clusters
        ?.flatMap((cluster) => cluster.keywords ?? [])
        ?.filter(Boolean) ?? []
    ),
  ]

  let manualKeywordList = uniqueList(manualKeywordCandidates)
  let queryList = uniqueList(input.searchQueries ?? [])

  if (!manualKeywordList.length && queryList.length) {
    manualKeywordList = queryList
  }

  if (manualKeywordList.length) {
    if (queryList.length) {
      return {
        description: describeQueries(queryList),
        source: 'search_queries',
        isFallback: false,
      }
    }

    return {
      description: describeManualKeywords(manualKeywordList),
      source: 'manual_keywords',
      isFallback: false,
    }
  }

  const orcidDescription = deriveOrcidDescription(input.orcid ?? null)
  if (orcidDescription) {
    return { description: orcidDescription, source: 'orcid_profile', isFallback: false }
  }

  const fallback = normaliseString(input.fallbackText ?? '')
  const description = fallback || FALLBACK_DESCRIPTION
  return { description, source: 'fallback', isFallback: true }
}

