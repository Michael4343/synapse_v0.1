#!/usr/bin/env node

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }

    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.GOOGLE_SCHOLAR_SERPAPI_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[recent-scholar] Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

if (!SERPAPI_KEY) {
  console.error('[recent-scholar] Missing SerpAPI credentials. Set SERPAPI_KEY in .env.local.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      'x-cli-tool': 'recent-scholar'
    }
  }
})

const RECENT_WINDOW_HOURS = 24
const FETCH_WINDOW_DAYS = 7
const RECENT_WINDOW_MS = RECENT_WINDOW_HOURS * 60 * 60 * 1000
const FETCH_WINDOW_MS = FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000
const MAX_FETCH_RESULTS = 100
const MAX_RESULTS_PER_RESEARCHER = 12
const MONTH_INDEX = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
}
const RELATIVE_UNIT_MS = {
  minute: 60 * 1000,
  minutes: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000
}

function uniqueKeywords(keywords) {
  if (!Array.isArray(keywords)) {
    return []
  }
  const seen = new Set()
  const result = []
  for (const raw of keywords) {
    if (!raw) {
      continue
    }
    const keyword = raw.trim()
    if (!keyword || seen.has(keyword.toLowerCase())) {
      continue
    }
    seen.add(keyword.toLowerCase())
    result.push(keyword)
  }
  return result
}

function parseScholarDate(raw) {
  if (!raw) {
    return null
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  const normalized = trimmed
    .replace(/^(published|updated)\s+/i, '')
    .replace(/\s+/g, ' ')

  const relativeMatch = normalized.match(/^(?:about\s+)?(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago\b/i)
  if (relativeMatch) {
    const amount = Number(relativeMatch[1])
    const unitMs = RELATIVE_UNIT_MS[relativeMatch[2].toLowerCase()]
    if (Number.isFinite(amount) && unitMs) {
      return new Date(Date.now() - amount * unitMs)
    }
  }

  if (/^yesterday$/i.test(normalized)) {
    return new Date(Date.now() - RELATIVE_UNIT_MS.day)
  }
  if (/^today$/i.test(normalized)) {
    return new Date()
  }

  const monthDayYearMatch = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (monthDayYearMatch) {
    const monthIndex = MONTH_INDEX[monthDayYearMatch[2].toLowerCase()]
    const year = Number(monthDayYearMatch[3])
    const day = Number(monthDayYearMatch[1])
    if (monthIndex !== undefined && Number.isFinite(year) && Number.isFinite(day)) {
      return new Date(Date.UTC(year, monthIndex, day))
    }

    const fallback = Date.parse(`${monthDayYearMatch[2]} ${monthDayYearMatch[1]}, ${monthDayYearMatch[3]}`)
    if (Number.isFinite(fallback)) {
      return new Date(fallback)
    }
  }

  const monthYearMatch = normalized.match(/^([A-Za-z]{3,9})\s+(\d{4})$/)
  if (monthYearMatch) {
    const monthIndex = MONTH_INDEX[monthYearMatch[1].toLowerCase()]
    const year = Number(monthYearMatch[2])
    if (monthIndex !== undefined && Number.isFinite(year)) {
      return new Date(Date.UTC(year, monthIndex, 1))
    }

    const fallback = Date.parse(`${monthYearMatch[1]} 1, ${monthYearMatch[2]}`)
    if (Number.isFinite(fallback)) {
      return new Date(fallback)
    }
  }

  const monthDayCommaMatch = normalized.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/)
  if (monthDayCommaMatch) {
    const monthIndex = MONTH_INDEX[monthDayCommaMatch[1].toLowerCase()]
    const day = Number(monthDayCommaMatch[2])
    const year = Number(monthDayCommaMatch[3])
    if (monthIndex !== undefined && Number.isFinite(year) && Number.isFinite(day)) {
      return new Date(Date.UTC(year, monthIndex, day))
    }

    const fallback = Date.parse(normalized)
    if (Number.isFinite(fallback)) {
      return new Date(fallback)
    }
  }

  const yearMatch = normalized.match(/^(?:19|20)\d{2}$/)
  if (yearMatch) {
    const year = Number(normalized)
    if (Number.isFinite(year)) {
      return new Date(Date.UTC(year, 0, 1))
    }

    const fallback = Date.parse(`${normalized}-01-01`)
    if (Number.isFinite(fallback)) {
      return new Date(fallback)
    }
  }

  // Try direct parsing first (handles ISO strings and "Mar 12, 2024").
  const direct = Date.parse(normalized)
  if (Number.isFinite(direct)) {
    return new Date(direct)
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const fallback = Date.parse(normalized)
    if (Number.isFinite(fallback)) {
      return new Date(fallback)
    }
  }

  return null
}

function isWithinWindow(date, windowMs) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false
  }
  const now = Date.now()
  const diff = now - date.getTime()
  return diff >= 0 && diff <= windowMs
}

function extractDateFromSummary(summary) {
  if (!summary) {
    return null
  }
  const normalized = summary.replace(/[\u2013\u2014]/g, '-')
  const datedMatch = normalized.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}/i)
  if (datedMatch) {
    return datedMatch[0]
  }
  const dayMonthMatch = normalized.match(/\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i)
  if (dayMonthMatch) {
    return dayMonthMatch[0]
  }
  const monthYearMatch = normalized.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}/i)
  if (monthYearMatch) {
    return monthYearMatch[0]
  }
  const isoMatch = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/)
  if (isoMatch) {
    return isoMatch[0]
  }
  const yearMatch = normalized.match(/(?:^|[\s,(\-])((?:19|20)\d{2})(?=\b)/)
  if (yearMatch) {
    return yearMatch[1]
  }
  return null
}

async function fetchResearchers() {
  const { data, error } = await supabase
    .from('researchers')
    .select('id, display_name, contact_email, research_interests')
    .eq('status', 'active')
    .order('display_name', { ascending: true })

  if (error) {
    throw new Error(`Supabase error: ${error.message}`)
  }

  return data ?? []
}

async function fetchScholarResults(query, attempt = 1) {
  const url = new URL('https://serpapi.com/search')
  url.searchParams.set('engine', 'google_scholar')
  url.searchParams.set('q', query)
  url.searchParams.set('scisbd', '2') // articles from last year sorted by date (all types)
  url.searchParams.set('as_ylo', new Date().getFullYear().toString()) // current year only
  url.searchParams.set('hl', 'en')
  url.searchParams.set('num', '100') // increased from 20 for better chance of finding recent papers
  url.searchParams.set('api_key', SERPAPI_KEY)

  const response = await fetch(url)
  if (!response.ok) {
    if (response.status === 429 && attempt <= 3) {
      const waitMs = 2000 * attempt
      console.error(`[recent-scholar] Rate limit from SerpAPI. Retrying in ${waitMs}ms (attempt ${attempt}/3).`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      return fetchScholarResults(query, attempt + 1)
    }

    const body = await response.text()
    throw new Error(`SerpAPI error (${response.status}): ${body}`)
  }

  const payload = await response.json()
  if (payload.error || payload.serpapi_error) {
    const message = payload.error || payload.serpapi_error
    throw new Error(`SerpAPI responded with an error: ${message}`)
  }

  const results = Array.isArray(payload.organic_results) ? payload.organic_results : []
  return results.slice(0, MAX_FETCH_RESULTS)
}

function transformResult(result) {
  const publicationInfo = result.publication_info || {}
  const authors = Array.isArray(publicationInfo.authors)
    ? publicationInfo.authors.map((author) => author.name).filter(Boolean)
    : []
  const summaryDate = extractDateFromSummary(publicationInfo.summary)
  const rawDate = (result.publication_date || summaryDate || null)
  const parsedDate = parseScholarDate(rawDate)
  const isRecent = parsedDate ? isWithinWindow(parsedDate, RECENT_WINDOW_MS) : null

  return {
    title: result.title || null,
    url: result.link || null,
    snippet: result.snippet || null,
    authors,
    source: publicationInfo.summary || null,
    publication_date: parsedDate ? parsedDate.toISOString() : null,
    raw_publication_date: rawDate,
    is_recent: isRecent
  }
}

async function main() {
  const researchers = await fetchResearchers()

  if (researchers.length === 0) {
    console.error('[recent-scholar] No active researchers found. Save profile keywords for a user to activate them.')
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), researchers: [] }, null, 2))
    process.exit(0)
  }

  console.error(`[recent-scholar] Fetching Scholar results for ${researchers.length} researcher(s).`)

  const combined = []

  for (const researcher of researchers) {
    const keywords = uniqueKeywords(researcher.research_interests)
    const fallbackQuery = researcher.display_name || 'research'
    const queries = keywords.length > 0 ? keywords : [fallbackQuery]

    console.error(
      `[recent-scholar] Running ${queries.length} query variant(s) for researcher ${researcher.display_name}.`
    )

    try {
      const aggregated = []
      const seenKeys = new Set()

      for (const [index, queryVariant] of queries.entries()) {
        console.error(
          `[recent-scholar]   Variant ${index + 1}/${queries.length}: "${queryVariant}"`
        )

        const rawResults = await fetchScholarResults(queryVariant)
        for (const rawResult of rawResults) {
          const transformed = transformResult(rawResult)
          const dedupeKey = (transformed.url || transformed.title || '').trim().toLowerCase()
          if (!dedupeKey || seenKeys.has(dedupeKey)) {
            continue
          }
          seenKeys.add(dedupeKey)
          aggregated.push(transformed)
        }
        console.error(
          `[recent-scholar]     Collected ${aggregated.length} unique result(s) so far.`
        )
      }

      const withinWindow = aggregated.filter((item) => {
        if (!item.publication_date) {
          return false
        }
        const publishedAt = new Date(item.publication_date)
        if (Number.isNaN(publishedAt.getTime())) {
          return false
        }
        return isWithinWindow(publishedAt, FETCH_WINDOW_MS)
      })

      if (withinWindow.length === 0 && aggregated.length > 0) {
        console.error('[recent-scholar] No papers within 7d – showing first few aggregated items for debugging:')
        console.error(
          JSON.stringify(
            aggregated.slice(0, 5).map((item) => ({
              title: item.title,
              raw_publication_date: item.raw_publication_date,
              parsed_publication_date: item.publication_date,
              is_recent: item.is_recent
            })),
            null,
            2
          )
        )
      }

      const sorted = withinWindow
        .slice()
        .sort((a, b) => {
          const aTime = a.publication_date ? new Date(a.publication_date).getTime() : -Infinity
          const bTime = b.publication_date ? new Date(b.publication_date).getTime() : -Infinity
          return bTime - aTime
        })
      const limited = sorted.slice(0, MAX_RESULTS_PER_RESEARCHER)

      combined.push({
        researcher_id: researcher.id,
        display_name: researcher.display_name,
        contact_email: researcher.contact_email,
        query: queries.join(' | '),
        keywords,
        results: limited
      })

      console.error(
        `[recent-scholar] Retrieved ${limited.length} result(s) within ${FETCH_WINDOW_DAYS}d (from ${aggregated.length} unique raw) for ${researcher.display_name}.`
      )
    } catch (error) {
      console.error(`[recent-scholar] Failed for ${researcher.display_name}: ${error.message}`)
      combined.push({
        researcher_id: researcher.id,
        display_name: researcher.display_name,
        contact_email: researcher.contact_email,
        query: queries.join(' | '),
        keywords,
        error: error.message,
        results: []
      })
    }
  }

  // Insert results into personal_feed_papers table
  console.error('[recent-scholar] Inserting papers into personal_feed_papers table...')
  let totalInserted = 0

  for (const researcher of combined) {
    if (researcher.results.length === 0) {
      console.error(`[recent-scholar] No papers to insert for ${researcher.display_name}`)
      continue
    }

    try {
      for (const paper of researcher.results) {
        const { error } = await supabase
          .from('personal_feed_papers')
          .insert({
            user_id: researcher.researcher_id,
            paper_title: paper.title || 'Untitled',
            paper_url: paper.url,
            paper_snippet: paper.snippet,
            paper_authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : null,
            publication_date: paper.publication_date,
            raw_publication_date: paper.raw_publication_date,
            query_keyword: researcher.keywords[0] || 'unknown',
            scraped_at: new Date().toISOString()
          })

        if (error) {
          console.error(`[recent-scholar] Failed to insert paper "${paper.title}": ${error.message}`)
        } else {
          totalInserted++
        }
      }

      console.error(`[recent-scholar] Inserted ${researcher.results.length} papers for ${researcher.display_name}`)
    } catch (error) {
      console.error(`[recent-scholar] Failed to insert papers for ${researcher.display_name}: ${error.message}`)
    }
  }

  console.error(`[recent-scholar] Total papers inserted: ${totalInserted}`)

  const output = {
    generated_at: new Date().toISOString(),
    researchers: combined,
    inserted_count: totalInserted
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error('[recent-scholar] Unexpected error:', error)
  process.exit(1)
})
