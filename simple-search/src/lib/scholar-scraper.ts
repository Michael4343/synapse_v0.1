// Google Scholar scraping utilities
// Extracted from scholar-feed.mjs for use in API routes

const FETCH_WINDOW_DAYS = 30
const FETCH_WINDOW_MS = FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000
const SCRAPER_DELAY_MS = 3000 // 3 seconds between requests

const MONTH_INDEX: Record<string, number> = {
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

const RELATIVE_UNIT_MS: Record<string, number> = {
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

export interface ScholarPaper {
  title: string
  url: string | null
  snippet: string
  authors: string
  source: string
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
    if (!keyword || seen.has(keyword.toLowerCase())) {
      continue
    }
    seen.add(keyword.toLowerCase())
    result.push(keyword)
  }
  return result
}

export function parseScholarDate(raw: string | null): Date | null {
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

  // Try relative dates first ("3 days ago")
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

  // Try "1 January 2024" format
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

  // Try "January 2024" format
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

  // Try "January 1, 2024" format
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

  // Try year only
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

  // Try direct parse
  const direct = Date.parse(normalized)
  if (Number.isFinite(direct)) {
    return new Date(direct)
  }

  // Try ISO format
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const fallback = Date.parse(normalized)
    if (Number.isFinite(fallback)) {
      return new Date(fallback)
    }
  }

  return null
}

export function isWithinWindow(date: Date | null, windowMs: number): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false
  }
  const now = Date.now()
  const diff = now - date.getTime()
  return diff >= 0 && diff <= windowMs
}

export async function scrapeGoogleScholar(query: string, scraperApiKey: string, attempt = 1): Promise<string> {
  // Build the Google Scholar URL
  const scholarUrl = new URL('https://scholar.google.com/scholar')
  scholarUrl.searchParams.set('q', query)
  scholarUrl.searchParams.set('scisbd', '1') // sort by date
  scholarUrl.searchParams.set('as_sdt', '0,5')
  scholarUrl.searchParams.set('hl', 'en')

  // Use ScraperAPI to bypass CAPTCHA
  const scraperApiUrl = new URL('http://api.scraperapi.com/')
  scraperApiUrl.searchParams.set('api_key', scraperApiKey)
  scraperApiUrl.searchParams.set('url', scholarUrl.toString())
  scraperApiUrl.searchParams.set('render', 'true') // Enable JavaScript rendering
  scraperApiUrl.searchParams.set('ultra_premium', 'true') // Use ultra premium proxies for Google Scholar
  scraperApiUrl.searchParams.set('country_code', 'us')

  let response: Response
  try {
    response = await fetch(scraperApiUrl.toString())
  } catch (error) {
    if (attempt <= 3) {
      const waitMs = 5000 * attempt
      console.error(`[scholar-scraper] Fetch failed (attempt ${attempt}/3). Retrying in ${waitMs}ms.`, error)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      return scrapeGoogleScholar(query, scraperApiKey, attempt + 1)
    }

    const message = error instanceof Error ? error.message : 'Unknown fetch error'
    throw new Error(`ScraperAPI fetch failed: ${message}`)
  }

  if (!response.ok) {
    if (response.status === 429 && attempt <= 3) {
      const waitMs = 5000 * attempt
      console.error(`[scholar-scraper] Rate limit. Retrying in ${waitMs}ms (attempt ${attempt}/3).`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      return scrapeGoogleScholar(query, scraperApiKey, attempt + 1)
    }

    const body = await response.text()
    throw new Error(`ScraperAPI error (${response.status}): ${body}`)
  }

  const html = await response.text()

  // Debug: Log first 2000 chars and HTML length
  console.log(`[scholar-scraper] Received HTML length: ${html.length} chars`)
  console.log(`[scholar-scraper] HTML preview: ${html.substring(0, 2000)}`)

  return html
}

export function parseScholarHTML(html: string): ScholarPaper[] {
  const results: ScholarPaper[] = []

  // Extract each result block using regex (simple HTML parsing)
  // Google Scholar wraps each result in a div with class "gs_r gs_or gs_scl"
  const resultPattern = /<div class="gs_r[^"]*"[^>]*>([\s\S]*?)<div class="gs_fl[\s\S]*?<\/div>/g

  let match
  let matchCount = 0
  while ((match = resultPattern.exec(html)) !== null) {
    matchCount++
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
    let rawDate: string | null = null
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

    const paper: ScholarPaper = {
      title,
      url,
      snippet,
      authors: authorInfo,
      source: authorInfo,
      publication_date: parsedDate ? parsedDate.toISOString() : null,
      raw_publication_date: rawDate
    }

    results.push(paper)
  }

  console.log(`[scholar-scraper] Regex matched ${matchCount} result blocks, extracted ${results.length} papers`)

  // Debug: If no matches, try to find what structure we're getting
  if (matchCount === 0) {
    console.log('[scholar-scraper] No matches found. Checking for common patterns...')
    const hasGsRi = html.includes('class="gs_ri"')
    const hasGsRt = html.includes('class="gs_rt"')
    const hasGsA = html.includes('class="gs_a"')
    const hasCaptcha = html.toLowerCase().includes('captcha')
    const hasError = html.toLowerCase().includes('error') || html.toLowerCase().includes('unusual traffic')
    console.log(`[scholar-scraper] Found: gs_ri=${hasGsRi}, gs_rt=${hasGsRt}, gs_a=${hasGsA}, captcha=${hasCaptcha}, error=${hasError}`)
  }

  return results
}

export async function fetchPapersForKeyword(
  keyword: string,
  scraperApiKey: string
): Promise<ScholarPaper[]> {
  console.log(`[scholar-scraper] Fetching papers for keyword: "${keyword}"`)

  const html = await scrapeGoogleScholar(keyword, scraperApiKey)
  const rawResults = parseScholarHTML(html)

  console.log(`[scholar-scraper] Found ${rawResults.length} raw results for "${keyword}"`)

  // Filter to papers within the time window
  const withinWindow = rawResults.filter((item) => {
    if (!item.publication_date) {
      return false
    }
    const publishedAt = new Date(item.publication_date)
    if (Number.isNaN(publishedAt.getTime())) {
      return false
    }
    return isWithinWindow(publishedAt, FETCH_WINDOW_MS)
  })

  console.log(`[scholar-scraper] ${withinWindow.length} papers within ${FETCH_WINDOW_DAYS}d window`)

  // Sort by publication date (most recent first)
  const sorted = withinWindow
    .slice()
    .sort((a, b) => {
      const aTime = a.publication_date ? new Date(a.publication_date).getTime() : -Infinity
      const bTime = b.publication_date ? new Date(b.publication_date).getTime() : -Infinity
      return bTime - aTime
    })

  return sorted
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { FETCH_WINDOW_DAYS, FETCH_WINDOW_MS, SCRAPER_DELAY_MS }
