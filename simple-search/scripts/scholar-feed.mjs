#!/usr/bin/env node

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL
const FEED_URL =
  process.env.RESEARCH_FEED_URL ||
  process.env.PLATFORM_FEED_URL ||
  process.env.APP_FEED_URL ||
  null

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[scholar-feed] Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

if (!SCRAPERAPI_KEY) {
  console.error('[scholar-feed] Missing SCRAPERAPI_KEY in .env.local')
  console.error('[scholar-feed] Get a free key at https://www.scraperapi.com/')
  process.exit(1)
}

if (!RESEND_API_KEY) {
  console.error('[scholar-feed] RESEND_API_KEY not set. Email notifications will be skipped.')
}

if (RESEND_API_KEY && !RESEND_FROM_EMAIL) {
  console.error('[scholar-feed] RESEND_FROM_EMAIL not set. Email notifications will be skipped.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      'x-cli-tool': 'scholar-feed'
    }
  }
})

const FETCH_WINDOW_DAYS = 7
const FETCH_WINDOW_MS = FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000
const MAX_RESULTS_PER_RESEARCHER = 12
const SCRAPER_DELAY_MS = 3000 // 3 seconds between requests to avoid rate limits

// Date parsing constants and functions
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

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function sendEmailSummary(researcher, queryCounts) {
  if (!resendClient || !RESEND_FROM_EMAIL) {
    return
  }

  const recipient = (researcher.contact_email || '').trim()
  if (!recipient) {
    return
  }

  const entries = Array.from(queryCounts.entries())
  if (entries.length === 0) {
    return
  }

  const totalNew = entries.reduce((sum, [, count]) => sum + (count || 0), 0)
  if (totalNew === 0) {
    return
  }

  const displayName = (researcher.display_name || '').trim()
  const firstName = displayName ? displayName.split(' ')[0] : 'there'

  const listItemsHtml = entries
    .map(([query, count]) => `<li><strong>${escapeHtml(query)}</strong>: ${count} new paper${count === 1 ? '' : 's'}</li>`)
    .join('\n')

  const listItemsText = entries
    .map(([query, count]) => `- ${query}: ${count} new paper${count === 1 ? '' : 's'}`)
    .join('\n')

  const subject = `${totalNew} new paper${totalNew === 1 ? '' : 's'} in your research feed`

  const htmlParts = [
    `<p>Hi ${escapeHtml(firstName)},</p>`,
    `<p>We just found ${totalNew} new paper${totalNew === 1 ? '' : 's'} across your search queries:</p>`,
    `<ul>${listItemsHtml}</ul>`
  ]

  if (FEED_URL) {
    htmlParts.push(`<p><a href="${escapeHtml(FEED_URL)}">Open your research feed</a> to read the details.</p>`)
  } else {
    htmlParts.push('<p>Sign in to your research feed to read the details.</p>')
  }

  htmlParts.push('<p>— Evidentia</p>')

  const textParts = [
    `Hi ${firstName},`,
    '',
    `We just found ${totalNew} new paper${totalNew === 1 ? '' : 's'} across your search queries:`,
    listItemsText,
    '',
    FEED_URL ? `Open your research feed: ${FEED_URL}` : 'Sign in to your research feed to read the details.',
    '',
    '— Evidentia'
  ]

  try {
    const { data, error } = await resendClient.emails.send({
      from: RESEND_FROM_EMAIL,
      to: recipient,
      subject,
      html: htmlParts.join('\n'),
      text: textParts.join('\n')
    })

    if (error) {
      console.error(
        `[scholar-feed] Failed to send email to ${recipient}: ${error.message}`
      )
      return
    }

    const id = data?.id ? ` (id: ${data.id})` : ''
    console.error(`[scholar-feed] Sent email notification to ${recipient} (${totalNew} new)${id}`)
  } catch (error) {
    console.error(
      `[scholar-feed] Failed to send email to ${recipient}: ${error.message}`
    )
  }
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

async function scrapeGoogleScholar(query, attempt = 1) {
  // Build the Google Scholar URL
  const scholarUrl = new URL('https://scholar.google.com/scholar')
  scholarUrl.searchParams.set('q', query)
  scholarUrl.searchParams.set('scisbd', '1') // sort by date
  scholarUrl.searchParams.set('as_sdt', '0,5')
  scholarUrl.searchParams.set('hl', 'en')

  // Use ScraperAPI to bypass CAPTCHA
  const scraperApiUrl = new URL('http://api.scraperapi.com/')
  scraperApiUrl.searchParams.set('api_key', SCRAPERAPI_KEY)
  scraperApiUrl.searchParams.set('url', scholarUrl.toString())
  scraperApiUrl.searchParams.set('render', 'true') // Enable JavaScript rendering
  scraperApiUrl.searchParams.set('ultra_premium', 'true') // Use ultra premium proxies for Google Scholar
  scraperApiUrl.searchParams.set('country_code', 'us')

  const response = await fetch(scraperApiUrl.toString())

  if (!response.ok) {
    if (response.status === 429 && attempt <= 3) {
      const waitMs = 5000 * attempt
      console.error(`[scholar-feed] Rate limit. Retrying in ${waitMs}ms (attempt ${attempt}/3).`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      return scrapeGoogleScholar(query, attempt + 1)
    }

    const body = await response.text()
    throw new Error(`ScraperAPI error (${response.status}): ${body}`)
  }

  const html = await response.text()
  return html
}

function parseScholarHTML(html) {
  const results = []

  // Extract each result block using regex (simple HTML parsing)
  // Google Scholar wraps each result in a div with class "gs_r gs_or gs_scl"
  // We capture from the opening gs_r tag up to the end of the gs_fl div (action buttons)
  const resultPattern = /<div class="gs_r[^"]*"[^>]*>([\s\S]*?)<div class="gs_fl[\s\S]*?<\/div>/g

  let match
  while ((match = resultPattern.exec(html)) !== null) {
    const resultHtml = match[1]

    // Extract title and URL from <h3 class="gs_rt">
    const titleMatch = resultHtml.match(/<h3[^>]*class="[^"]*gs_rt[^"]*"[^>]*>(?:<a[^>]*href="([^"]+)"[^>]*>)?(.*?)<\/(?:a|h3)>/s)
    if (!titleMatch) continue

    const url = titleMatch[1] || null
    const titleHtml = titleMatch[2]
    // Strip HTML tags from title
    const title = titleHtml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()

    // Extract author/publication info from <div class="gs_a">
    const authorMatch = resultHtml.match(/<div class="gs_a"[^>]*>(.*?)<\/div>/s)
    const authorInfo = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : ''

    // Extract snippet from <div class="gs_rs">
    const snippetMatch = resultHtml.match(/<div class="gs_rs"[^>]*>(.*?)<\/div>/s)
    const snippetHtml = snippetMatch ? snippetMatch[1] : ''
    const snippet = snippetHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()

    // Extract date from <span class="gs_age"> within the snippet
    let rawDate = null
    const ageMatch = snippetHtml.match(/<span class="gs_age">(.*?)<\/span>/s)
    if (ageMatch) {
      // Extract "3 days ago -" and remove the trailing " - "
      rawDate = ageMatch[1].replace(/\s*-\s*$/, '').trim()
    }

    // If no gs_age span, try to find date in author info
    if (!rawDate) {
      // Try to find relative date like "3 days ago"
      const relativeDateMatch = authorInfo.match(/(\d+\s+(?:minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i)
      if (relativeDateMatch) {
        rawDate = relativeDateMatch[1]
      } else {
        // Try to find absolute date
        const absoluteDateMatch = authorInfo.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}/i)
        if (absoluteDateMatch) {
          rawDate = absoluteDateMatch[0]
        } else {
          // Try year only
          const yearMatch = authorInfo.match(/,\s+(\d{4})\s+-/)
          if (yearMatch) {
            rawDate = yearMatch[1]
          }
        }
      }
    }

    const parsedDate = parseScholarDate(rawDate)

    const paper = {
      title,
      url,
      snippet,
      authors: authorInfo,
      source: authorInfo,
      publication_date: parsedDate,
      raw_publication_date: rawDate
    }

    results.push(paper)
  }

  return results
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

async function main() {
  const researchers = await fetchResearchers()

  if (researchers.length === 0) {
    console.error('[scholar-feed] No active researchers found. Save profile keywords for a user to activate them.')
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), researchers: [] }, null, 2))
    process.exit(0)
  }

  console.error(`[scholar-feed] Fetching Scholar results for ${researchers.length} researcher(s).`)

  const combined = []

  for (const researcher of researchers) {
    const keywords = uniqueKeywords(researcher.research_interests)
    const fallbackQuery = researcher.display_name || 'research'
    const queries = keywords.length > 0 ? keywords : [fallbackQuery]
    const queryCounts = new Map(queries.map((query) => [query, 0]))

    console.error(
      `[scholar-feed] Running ${queries.length} query variant(s) for researcher ${researcher.display_name}.`
    )

    try {
      const aggregated = []
      const seenKeys = new Set()

      for (const [index, queryVariant] of queries.entries()) {
        console.error(
          `[scholar-feed]   Variant ${index + 1}/${queries.length}: "${queryVariant}"`
        )

        // Scrape Google Scholar
        const html = await scrapeGoogleScholar(queryVariant)
        const rawResults = parseScholarHTML(html)

        for (const rawResult of rawResults) {
          const dedupeKey = (rawResult.url || rawResult.title || '').trim().toLowerCase()
          if (!dedupeKey || seenKeys.has(dedupeKey)) {
            continue
          }
          seenKeys.add(dedupeKey)
          aggregated.push({
            title: rawResult.title || null,
            url: rawResult.url || null,
            snippet: rawResult.snippet || null,
            authors: rawResult.authors || '',
            source: rawResult.source || null,
            publication_date: rawResult.publication_date ? rawResult.publication_date.toISOString() : null,
            raw_publication_date: rawResult.raw_publication_date,
            source_query: queryVariant
          })
        }

        console.error(
          `[scholar-feed]     Collected ${aggregated.length} unique result(s) so far.`
        )

        // Add delay between requests to avoid rate limits
        if (index < queries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, SCRAPER_DELAY_MS))
        }
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
        console.error('[scholar-feed] No papers within 7d – showing first few aggregated items for debugging:')
        console.error(
          JSON.stringify(
            aggregated.slice(0, 5).map((item) => ({
              title: item.title,
              raw_publication_date: item.raw_publication_date,
              parsed_publication_date: item.publication_date
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

      // Store papers in database for this user
      try {
        // Delete old papers for this user (older than 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const { error: deleteError } = await supabase
          .from('personal_feed_papers')
          .delete()
          .eq('user_id', researcher.id)
          .lt('scraped_at', thirtyDaysAgo)

        if (deleteError) {
          console.error(`[scholar-feed] Failed to delete old papers for ${researcher.display_name}: ${deleteError.message}`)
        }

        // Insert new papers
        if (limited.length > 0) {
          const papersToInsert = limited.map((paper) => {
            const querySource = paper.source_query || (queries.length > 0 ? queries[0] : 'unknown')
            return {
              user_id: researcher.id,
              paper_title: paper.title,
              paper_url: paper.url,
              paper_snippet: paper.snippet,
              paper_authors: paper.authors,
              publication_date: paper.publication_date,
              raw_publication_date: paper.raw_publication_date,
              query_keyword: querySource // Track which keyword found this paper
            }
          })

          const { error: insertError } = await supabase
            .from('personal_feed_papers')
            .insert(papersToInsert)

          if (insertError) {
            console.error(`[scholar-feed] Failed to insert papers for ${researcher.display_name}: ${insertError.message}`)
          } else {
            console.error(`[scholar-feed] Stored ${papersToInsert.length} papers in database for ${researcher.display_name}`)
            for (const paper of limited) {
              const querySource = paper.source_query || (queries.length > 0 ? queries[0] : 'unknown')
              if (!queryCounts.has(querySource)) {
                queryCounts.set(querySource, 0)
              }
              queryCounts.set(querySource, (queryCounts.get(querySource) || 0) + 1)
            }
          }
        }
      } catch (dbError) {
        console.error(`[scholar-feed] Database error for ${researcher.display_name}:`, dbError)
      }

      await sendEmailSummary(researcher, queryCounts)

      combined.push({
        researcher_id: researcher.id,
        display_name: researcher.display_name,
        contact_email: researcher.contact_email,
        query: queries.join(' | '),
        keywords,
        query_counts: Object.fromEntries(queryCounts),
        results: limited
      })

      console.error(
        `[scholar-feed] Retrieved ${limited.length} result(s) within ${FETCH_WINDOW_DAYS}d (from ${aggregated.length} unique raw) for ${researcher.display_name}.`
      )
    } catch (error) {
      console.error(`[scholar-feed] Failed for ${researcher.display_name}: ${error.message}`)
      combined.push({
        researcher_id: researcher.id,
        display_name: researcher.display_name,
        contact_email: researcher.contact_email,
        query: queries.join(' | '),
        keywords,
        query_counts: Object.fromEntries(queryCounts),
        error: error.message,
        results: []
      })
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    researchers: combined
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error('[scholar-feed] Unexpected error:', error)
  process.exit(1)
})
