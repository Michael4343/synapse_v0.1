import { generateDigestWithGemini } from '@/lib/llm/gemini'
import type { GeminiDigest } from '@/lib/llm/gemini'
import { resolveUserDescription } from '@/lib/profile/resolveUserDescription'
import type { DescriptionSource } from '@/lib/profile/resolveUserDescription'
import {
  enrichWeeklyDigestPapers,
  type EnrichedWeeklyPaper,
  type WeeklyPaperCandidate,
} from '@/lib/papers/enrich-weekly-digest'

import { supabaseAdmin } from './supabase-server'
import { TABLES } from './supabase'

interface DigestPaper {
  title: string
  authors: string[]
  abstract: string
  venue: string | null
  citationCount: number | null
  url: string | null
  explanation: string
}

interface WeeklyDigest {
  id: string
  summary: string
  mustReadPapers: DigestPaper[]
  worthReadingPapers: DigestPaper[]
  papersCount: number
  weekStartDate: string
  generatedAt: string
  profileDescription: string
  profileSource: DescriptionSource
  profileIsFallback: boolean
  traceId: string
}

interface StoredWeeklyDigest {
  id: string
  summary: string
  mustReadPapers: DigestPaper[]
  worthReadingPapers: DigestPaper[]
  papersCount: number
  weekStartDate: string
  generatedAt: string
}

interface DigestLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

interface ProfileDescriptor {
  description: string
  source: DescriptionSource
  isFallback: boolean
}

interface DigestSections {
  summary: string
  mustReadPapers: DigestPaper[]
  worthReadingPapers: DigestPaper[]
}

interface PersonalFeedRow {
  paper_title?: string | null
  paper_url?: string | null
  publication_date?: string | null
  scraped_at?: string | null
  query_keyword?: string | null
  semantic_scholar_id?: string | null
  semanticScholarId?: string | null
  doi?: string | null
  pmid?: string | null
  source_api?: string | null
  source?: string | null
  title?: string | null
  url?: string | null
}

const MAX_LLM_PAPERS = 12
const MIN_MEANINGFUL_ABSTRACT_LENGTH = 120

function getWeekStartDate(): string {
  const now = new Date()
  const monday = new Date(now)
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

export function createDigestTraceId(userId: string): string {
  const compactUser = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')
  return `${Date.now().toString(36)}-${compactUser}`
}

function createLogger(traceId: string): DigestLogger {
  const log = (level: 'log' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    const payload = { traceId, ...meta }
    console[level]('[weekly-digest]', message, payload)
  }

  return {
    info: (message, meta) => log('log', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
  }
}

async function getCachedDigest(
  userId: string,
  weekStartDate: string,
  log: DigestLogger
): Promise<StoredWeeklyDigest | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLES.WEEKLY_DIGESTS)
      .select('id, summary, must_read_papers, worth_reading_papers, papers_count, week_start_date, generated_at')
      .eq('user_id', userId)
      .eq('week_start_date', weekStartDate)
      .maybeSingle()

    if (error) {
      if (error.message && /relation .* does not exist/i.test(error.message)) {
        log.warn('cache_table_missing', { message: error.message })
        return null
      }
      log.warn('cache_lookup_failed', { error: error.message })
      return null
    }

    if (!data) {
      return null
    }

    return {
      id: `digest-${userId}-${weekStartDate}`,
      summary: data.summary,
      mustReadPapers: (data.must_read_papers ?? []) as DigestPaper[],
      worthReadingPapers: (data.worth_reading_papers ?? []) as DigestPaper[],
      papersCount: typeof data.papers_count === 'number' ? data.papers_count : 0,
      weekStartDate: data.week_start_date,
      generatedAt: data.generated_at ?? new Date().toISOString(),
    }
  } catch (error) {
    log.warn('cache_unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function storeDigest(
  userId: string,
  weekStartDate: string,
  digest: DigestSections,
  papersCount: number,
  log: DigestLogger
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from(TABLES.WEEKLY_DIGESTS)
      .upsert(
        {
          user_id: userId,
          week_start_date: weekStartDate,
          summary: digest.summary,
          must_read_papers: digest.mustReadPapers,
          worth_reading_papers: digest.worthReadingPapers,
          papers_count: papersCount,
          generated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,week_start_date',
        }
      )

    if (error) {
      log.warn('cache_store_failed', { error: error.message })
    } else {
      log.info('cache_store_success', { weekStartDate })
    }
  } catch (error) {
    log.warn('cache_store_unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function getPersonalFeedRows(
  userId: string,
  log: DigestLogger
): Promise<{ rows: PersonalFeedRow[]; searchQueries: string[] }> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  try {
    const { data, error } = await supabaseAdmin
      .from('personal_feed_papers')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('publication_date', { ascending: false, nullsFirst: false })
      .order('scraped_at', { ascending: false })
      .limit(60)

    if (error) {
      log.warn('personal_feed_query_failed', { error: error.message })
      return { rows: [], searchQueries: [] }
    }

    const rows = data ?? []
    const searchQueries = Array.from(
      new Set(
        rows
          .map((row) => row.query_keyword)
          .filter((keyword): keyword is string => Boolean(keyword && keyword.trim()))
      )
    ).slice(0, 6)

    return { rows, searchQueries }
  } catch (error) {
    log.warn('personal_feed_query_unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { rows: [], searchQueries: [] }
  }
}

function mapRowsToCandidates(rows: PersonalFeedRow[]): WeeklyPaperCandidate[] {
  const out: WeeklyPaperCandidate[] = []

  for (const row of rows) {
    const title = (row.paper_title ?? row.title ?? '').trim()
    const url = (row.paper_url ?? row.url ?? '').trim()
    if (!title || !url) continue

    const candidate: WeeklyPaperCandidate = {
      title,
      url, // ok even if WeeklyPaperCandidate.url is optional
      semanticScholarId: String(row.semantic_scholar_id ?? row.semanticScholarId ?? ''),
      doi: String(row.doi ?? ''),
      pmid: String(row.pmid ?? ''),
      source: String(row.source_api ?? row.source ?? row.query_keyword ?? ''),
      publicationDate: String(row.publication_date ?? row.scraped_at ?? ''),
    }

    out.push(candidate)
  }

  return out
}


async function fetchProfileRow(userId: string, log: DigestLogger): Promise<Record<string, unknown> | null> {
  const columnSets = [
    'profile_bio, profile_personalization, manual_keywords, orcid_id',
    'profile_personalization, manual_keywords, orcid_id',
    'profile_personalization, orcid_id',
  ]

  for (const columns of columnSets) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(columns)
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      if (error.message && /column .* does not exist/i.test(error.message)) {
        continue
      }
      log.warn('profile_fetch_failed', { error: error.message })
      return null
    }

    if (data && typeof data === 'object' && data !== null) {
      return data as Record<string, unknown>;
    }
  }

  return null
}

async function fetchResearcherRow(userId: string, log: DigestLogger): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('researchers')
    .select('research_interests')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (!(error.message && /relation .* does not exist/i.test(error.message))) {
      log.warn('researcher_fetch_failed', { error: error.message })
    }
    return null
  }

  return data ?? null
}

async function buildProfileDescriptor(
  userId: string,
  searchQueries: string[],
  log: DigestLogger
): Promise<ProfileDescriptor> {
  const [profileRow, researcherRow] = await Promise.all([
    fetchProfileRow(userId, log),
    fetchResearcherRow(userId, log),
  ])

  const profileBio =
    typeof profileRow?.profile_bio === 'string'
      ? (profileRow.profile_bio as string)
      : typeof profileRow?.profile_description === 'string'
        ? (profileRow.profile_description as string)
        : null

  const profilePersonalization =
    typeof profileRow?.profile_personalization === 'object' && profileRow?.profile_personalization !== null
      ? (profileRow.profile_personalization as Record<string, unknown>)
      : null

  const manualKeywords =
    typeof profileRow?.manual_keywords === 'string' ? (profileRow.manual_keywords as string) : null

  const orcidKeywords = Array.isArray(researcherRow?.research_interests)
    ? (researcherRow?.research_interests as string[]).filter((value) => typeof value === 'string')
    : []

  const description = resolveUserDescription({
    profileBio,
    profilePersonalization: profilePersonalization as any,
    searchQueries,
    orcid: orcidKeywords.length ? { keywords: orcidKeywords } : undefined,
    fallbackText: manualKeywords ?? undefined,
  })

  log.info('profile_resolved', {
    profileSource: description.source,
    isFallback: description.isFallback,
  })

  return description
}

function mapGeminiDigestPayload(
  enriched: EnrichedWeeklyPaper[],
  payload: GeminiDigest,
  userDescription: string
): DigestSections {
  const summary =
    typeof payload.summary === 'string' && payload.summary.trim()
      ? payload.summary.trim()
      : 'Here are this week’s most relevant papers based on your profile. Scan the highlights below to prioritise your reading.'

  const mustReadPapers: DigestPaper[] = []
  const worthReadingPapers: DigestPaper[] = []
  const usedIndexes = new Set<number>()

  if (Array.isArray(payload.must_read)) {
    payload.must_read.forEach((entry) => {
      if (typeof entry?.idx !== 'number') {
        return
      }
      const index = Math.floor(entry.idx) - 1
      if (index < 0 || index >= enriched.length) {
        return
      }
      if (usedIndexes.has(index)) {
        return
      }
      usedIndexes.add(index)

      const paper = enriched[index]
      const fallbackBlurb = `Included based on available metadata (citations: ${paper.citationCount ?? 0}). Consider skimming to assess fit for ${userDescription}.`
      const whyBlurb =
      typeof entry.why === 'string' && entry.why.trim()
        ? entry.why.trim()
        : fallbackBlurb
    

      mustReadPapers.push({
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        venue: paper.venue,
        citationCount: paper.citationCount,
        url: paper.url,
        explanation: whyBlurb,
      })
    })
  }

  if (Array.isArray(payload.worth_reading)) {
    payload.worth_reading.forEach((entry) => {
      if (typeof entry?.idx !== 'number') {
        return
      }
      const index = Math.floor(entry.idx) - 1
      if (index < 0 || index >= enriched.length) {
        return
      }
      if (usedIndexes.has(index)) {
        return
      }

      const paper = enriched[index]
      const explanation =
        typeof entry.note === 'string' && entry.note.trim().length > 0
          ? entry.note.trim()
          : 'Relevant to your interests this week.'

      worthReadingPapers.push({
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
        venue: paper.venue,
        citationCount: paper.citationCount,
        url: paper.url,
        explanation,
      })
      usedIndexes.add(index)
    })
  }

  return {
    summary,
    mustReadPapers,
    worthReadingPapers,
  }
}

function createFallbackDigest(enriched: EnrichedWeeklyPaper[], userDescription: string): DigestSections {
  if (!enriched.length) {
    return {
      summary:
        'No strong matches were found for your recent research focus this week. Try adjusting your profile keywords or expanding your scope to surface new results.',
      mustReadPapers: [],
      worthReadingPapers: [],
    }
  }

  const sorted = [...enriched].sort((a, b) => {
    const citationDiff = (b.citationCount ?? 0) - (a.citationCount ?? 0)
    if (citationDiff !== 0) {
      return citationDiff
    }
    const dateA = a.publicationDate ? new Date(a.publicationDate).getTime() : 0
    const dateB = b.publicationDate ? new Date(b.publicationDate).getTime() : 0
    return dateB - dateA
  })

  const mustReadCount = Math.max(1, Math.min(3, Math.ceil(sorted.length * 0.25)))
  const mustReadPapers = sorted.slice(0, mustReadCount).map((paper) => ({
    title: paper.title,
    authors: paper.authors,
    abstract: paper.abstract,
    venue: paper.venue,
    citationCount: paper.citationCount,
    url: paper.url,
    explanation: `Included based on available metadata (citations: ${paper.citationCount ?? 0}). Consider skimming to assess fit for ${userDescription}.`,
  }))

  const worthReadingPapers = sorted.slice(mustReadCount).map((paper) => ({
    title: paper.title,
    authors: paper.authors,
    abstract: paper.abstract,
    venue: paper.venue,
    citationCount: paper.citationCount,
    url: paper.url,
    explanation: 'Flagged from your recent feed. Review if the title aligns with current priorities.',
  }))

  const summary =
    'Here are this week’s most relevant papers based on your profile. I couldn’t generate a tailored narrative right now, but the list is filtered to your stated interests.'

  return {
    summary,
    mustReadPapers,
    worthReadingPapers,
  }
}

function buildWeeklyDigestResponse(
  base: DigestSections,
  weekStartDate: string,
  enrichedCount: number,
  userId: string
): StoredWeeklyDigest {
  return {
    id: `digest-${userId}-${weekStartDate}`,
    summary: base.summary,
    mustReadPapers: base.mustReadPapers,
    worthReadingPapers: base.worthReadingPapers,
    papersCount: enrichedCount,
    weekStartDate,
    generatedAt: new Date().toISOString(),
  }
}

export async function getWeeklyDigest(userId: string, existingTraceId?: string): Promise<WeeklyDigest | null> {
  const traceId = existingTraceId ?? createDigestTraceId(userId)
  const log = createLogger(traceId)
  const weekStartDate = getWeekStartDate()

  log.info('digest_start', { userId, weekStartDate })

  let cached: StoredWeeklyDigest | null = null
  try {
    cached = await getCachedDigest(userId, weekStartDate, log)
  } catch (error) {
    log.warn('cache_lookup_exception', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  const { rows, searchQueries } = await getPersonalFeedRows(userId, log)
  const candidates = mapRowsToCandidates(rows)
  const profileDescriptor = await buildProfileDescriptor(userId, searchQueries, log)

  if (cached) {
    log.info('digest_cache_hit', {
      cache: 'hit',
      profileSource: profileDescriptor.source,
    })

    return {
      ...cached,
      profileDescription: profileDescriptor.description,
      profileSource: profileDescriptor.source,
      profileIsFallback: profileDescriptor.isFallback,
      traceId,
    }
  }

  if (!candidates.length) {
    log.warn('digest_no_candidates', { cache: 'miss', profileSource: profileDescriptor.source })
    const fallbackDigest = createFallbackDigest([], profileDescriptor.description)
    try {
      await storeDigest(userId, weekStartDate, fallbackDigest, 0, log)
    } catch (error) {
      log.warn('cache_store_exception', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    const prepared = buildWeeklyDigestResponse(fallbackDigest, weekStartDate, 0, userId)
    return {
      ...prepared,
      profileDescription: profileDescriptor.description,
      profileSource: profileDescriptor.source,
      profileIsFallback: profileDescriptor.isFallback,
      traceId,
    }
  }

  log.info('digest_candidates_loaded', { candidates: candidates.length })

  const enriched = await enrichWeeklyDigestPapers(candidates, { maxPapers: MAX_LLM_PAPERS })
  const withMeaningfulAbstract = enriched.filter(
    (paper) => paper.abstractSource !== 'generated' && paper.abstract.length >= MIN_MEANINGFUL_ABSTRACT_LENGTH
  ).length

  log.info('digest_enrichment_complete', {
    candidates: candidates.length,
    enriched: enriched.length,
    abstracts: withMeaningfulAbstract,
  })

  if (!enriched.length) {
    log.warn('digest_no_enriched_papers', { candidates: candidates.length })
    const fallbackDigest = createFallbackDigest([], profileDescriptor.description)
    try {
      await storeDigest(userId, weekStartDate, fallbackDigest, 0, log)
    } catch (error) {
      log.warn('cache_store_exception', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    const prepared = buildWeeklyDigestResponse(fallbackDigest, weekStartDate, 0, userId)
    return {
      ...prepared,
      profileDescription: profileDescriptor.description,
      profileSource: profileDescriptor.source,
      profileIsFallback: profileDescriptor.isFallback,
      traceId,
    }
  }

  let digestPayload: DigestSections
  let llmDurationMs = 0

  const llmStartedAt = Date.now()

  try {
    const aiResult = await generateDigestWithGemini(
      profileDescriptor.description,
      enriched.map((paper) => ({
        title: paper.title,
        abstract: paper.abstract,
        venue: paper.venue,
        citationCount: paper.citationCount,
      }))
    )
    llmDurationMs = Date.now() - llmStartedAt
    digestPayload = mapGeminiDigestPayload(enriched, aiResult, profileDescriptor.description)
    log.info('digest_llm_success', { llm_ms: llmDurationMs, papers: enriched.length })
  } catch (error) {
    log.warn('digest_llm_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    llmDurationMs = 0
    digestPayload = createFallbackDigest(enriched, profileDescriptor.description)
  }

  const prepared = buildWeeklyDigestResponse(digestPayload, weekStartDate, enriched.length, userId)
  try {
    await storeDigest(userId, weekStartDate, digestPayload, enriched.length, log)
  } catch (error) {
    log.warn('cache_store_exception', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  log.info('digest_complete', {
    cache: 'miss',
    papers: enriched.length,
    llm_ms: llmDurationMs,
    profileSource: profileDescriptor.source,
  })

  return {
    ...prepared,
    profileDescription: profileDescriptor.description,
    profileSource: profileDescriptor.source,
    profileIsFallback: profileDescriptor.isFallback,
    traceId,
  }
}

export type { DigestPaper, WeeklyDigest }
