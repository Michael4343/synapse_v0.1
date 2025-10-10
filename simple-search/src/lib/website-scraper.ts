/**
 * Website scraper for extracting text content from academic profile pages
 * Uses Firecrawl API for robust scraping that bypasses bot detection and handles JavaScript
 */

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape'

interface ScrapeResult {
  text: string
  title?: string
  error?: string
}

/**
 * Validate and normalize URL
 */
function normalizeUrl(url: string): string {
  // Add https:// if no protocol specified
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url
  }

  try {
    const parsed = new URL(url)
    return parsed.toString()
  } catch (error) {
    throw new Error('Invalid URL format')
  }
}

/**
 * Scrape website using Firecrawl API
 */
async function scrapeWithFirecrawl(url: string): Promise<{ content: string | null; title: string | null; error?: string }> {
  if (!FIRECRAWL_API_KEY) {
    console.error('Firecrawl API key is not configured.')
    return {
      content: null,
      title: null,
      error: 'Firecrawl API is not configured. Please contact support.'
    }
  }

  try {
    const firecrawlResponse = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 30000, // 30 second timeout
      }),
    })

    if (firecrawlResponse.ok) {
      const firecrawlData = await firecrawlResponse.json()
      const content = firecrawlData.data?.markdown
      const metadata = firecrawlData.data?.metadata
      const title = metadata?.title || metadata?.ogTitle || null

      if (content && content.trim()) {
        // Check if we got meaningful content
        if (content.length < 200) {
          return {
            content: null,
            title: null,
            error: 'Could not extract enough text from the website. The page might be empty or access-restricted.'
          }
        }

        // Limit text length to avoid overwhelming the LLM
        const maxLength = 50000 // ~50KB of text
        const truncatedContent = content.length > maxLength ? content.substring(0, maxLength) : content

        return {
          content: truncatedContent,
          title,
        }
      } else {
        return {
          content: null,
          title: null,
          error: 'Could not extract text from the website. The page might be empty or require authentication.'
        }
      }
    } else if (firecrawlResponse.status === 402) {
      return {
        content: null,
        title: null,
        error: 'This website requires authentication or is behind a paywall. Please try a different URL.'
      }
    } else if (firecrawlResponse.status === 403) {
      return {
        content: null,
        title: null,
        error: 'Access to this website is forbidden. The site may be blocking automated access.'
      }
    } else if (firecrawlResponse.status === 429) {
      return {
        content: null,
        title: null,
        error: 'Rate limit exceeded. Please try again in a few minutes.'
      }
    } else {
      console.error(`Firecrawl API failed with status: ${firecrawlResponse.status}`)
      const errorBody = await firecrawlResponse.text()
      console.error('Firecrawl error body:', errorBody)
      return {
        content: null,
        title: null,
        error: `Failed to scrape website (status ${firecrawlResponse.status}). Please try again or contact support.`
      }
    }
  } catch (error) {
    console.error('Error scraping with Firecrawl:', error)

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          content: null,
          title: null,
          error: 'Website request timed out. Please try again or check if the website is accessible.'
        }
      }

      return {
        content: null,
        title: null,
        error: `Network error: ${error.message}`
      }
    }

    return {
      content: null,
      title: null,
      error: 'An unexpected error occurred while scraping the website.'
    }
  }
}

/**
 * Fetch and scrape website content
 * @param url - The URL of the academic profile page to scrape
 * @returns ScrapeResult with extracted text and metadata
 */
export async function scrapeWebsite(url: string): Promise<ScrapeResult> {
  try {
    // Normalize and validate URL
    const normalizedUrl = normalizeUrl(url)

    // Scrape with Firecrawl
    const result = await scrapeWithFirecrawl(normalizedUrl)

    if (result.error) {
      return {
        text: '',
        error: result.error
      }
    }

    if (!result.content) {
      return {
        text: '',
        error: 'No content could be extracted from the website.'
      }
    }

    return {
      text: result.content,
      title: result.title || undefined,
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid URL format') {
        return {
          text: '',
          error: 'Invalid URL format. Please enter a valid website URL (e.g., https://university.edu/profile)'
        }
      }

      return {
        text: '',
        error: `Failed to access website: ${error.message}`
      }
    }

    return {
      text: '',
      error: 'An unexpected error occurred while scraping the website.'
    }
  }
}
