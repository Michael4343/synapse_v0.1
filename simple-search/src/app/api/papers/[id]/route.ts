
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const paperId = resolvedParams.id

  if (!paperId) {
    return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
  }

  // 1. Fetch paper details from Supabase
  const { data: paper, error: dbError } = await supabaseAdmin
    .from(TABLES.SEARCH_RESULTS)
    .select('*')
    .eq('id', paperId)
    .single()

  if (dbError || !paper) {
    console.error('Supabase error:', dbError)
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }

  // 2. If there's a DOI, scrape with Firecrawl
  let scrapedContent: string | null = null
  if (paper.doi) {
    if (!FIRECRAWL_API_KEY) {
      console.error('Firecrawl API key is not configured.')
      // Continue without scraped content, but log the error.
    } else {
      try {
        const firecrawlResponse = await fetch(FIRECRAWL_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url: `https://doi.org/${paper.doi}`,
            extractorOptions: {
                mode: 'markdown'
              }
          }),
        })

        if (firecrawlResponse.ok) {
          const firecrawlData = await firecrawlResponse.json()
          scrapedContent = firecrawlData.data.markdown
        } else {
          console.error(`Firecrawl API failed with status: ${firecrawlResponse.status}`)
          const errorBody = await firecrawlResponse.text()
          console.error('Firecrawl error body:', errorBody)
        }
      } catch (e) {
        console.error('Error scraping with Firecrawl:', e)
      }
    }
  }

  // 3. Return combined data
  return NextResponse.json({
    ...paper,
    scrapedContent,
  })
}
