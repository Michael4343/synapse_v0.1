import { NextRequest, NextResponse } from 'next/server'
import { createClient, supabaseAdmin } from '@/lib/supabase-server'
import { fetchPapersForKeyword, delay, SCRAPER_DELAY_MS, uniqueKeywords } from '@/lib/scholar-scraper'

const MAX_RESULTS_PER_KEYWORD = 12

interface PopulateRequestBody {
  keywords?: string[]
}

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body
  let body: PopulateRequestBody
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate keywords
  const keywords = uniqueKeywords(body.keywords || [])

  if (keywords.length === 0) {
    return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 })
  }

  if (keywords.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 keywords allowed' }, { status: 400 })
  }

  // Check for ScraperAPI key
  const scraperApiKey = process.env.SCRAPERAPI_KEY
  if (!scraperApiKey) {
    return NextResponse.json({
      error: 'SCRAPERAPI_KEY not configured on server',
      processed: 0,
      papers_found: 0
    }, { status: 500 })
  }

  console.log(`[populate] Starting feed population for user ${user.id} with ${keywords.length} keywords`)

  try {
    // Delete old papers (older than 30 days) for this user
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error: deleteError } = await supabaseAdmin
      .from('personal_feed_papers')
      .delete()
      .eq('user_id', user.id)
      .lt('scraped_at', thirtyDaysAgo)

    if (deleteError) {
      console.error(`[populate] Failed to delete old papers:`, deleteError)
      // Don't fail - this is cleanup
    }

    // Process each keyword sequentially
    let totalPapersFound = 0
    const seenUrls = new Set<string>()

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i]
      console.log(`[populate] Processing keyword ${i + 1}/${keywords.length}: "${keyword}"`)

      try {
        // Fetch papers for this keyword
        const papers = await fetchPapersForKeyword(keyword, scraperApiKey)

        // Deduplicate and limit
        const papersToInsert = papers
          .filter(paper => {
            const key = (paper.url || paper.title).toLowerCase()
            if (seenUrls.has(key)) return false
            seenUrls.add(key)
            return true
          })
          .slice(0, MAX_RESULTS_PER_KEYWORD)
          .map(paper => ({
            user_id: user.id,
            paper_title: paper.title,
            paper_url: paper.url,
            paper_snippet: paper.snippet,
            paper_authors: paper.authors,
            publication_date: paper.publication_date,
            raw_publication_date: paper.raw_publication_date,
            query_keyword: keyword
          }))

        // Insert papers to database
        if (papersToInsert.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from('personal_feed_papers')
            .insert(papersToInsert)

          if (insertError) {
            console.error(`[populate] Failed to insert papers for keyword "${keyword}":`, insertError)
            // Continue to next keyword even if insert fails
          } else {
            totalPapersFound += papersToInsert.length
            console.log(`[populate] Inserted ${papersToInsert.length} papers for keyword "${keyword}"`)
          }
        } else {
          console.log(`[populate] No papers found for keyword "${keyword}"`)
        }

        // Delay before next keyword (except after last one)
        if (i < keywords.length - 1) {
          console.log(`[populate] Waiting ${SCRAPER_DELAY_MS}ms before next keyword...`)
          await delay(SCRAPER_DELAY_MS)
        }

      } catch (error) {
        console.error(`[populate] Error processing keyword "${keyword}":`, error)
        // Continue to next keyword even if one fails

        // Still delay before next keyword to avoid rate limiting
        if (i < keywords.length - 1) {
          await delay(SCRAPER_DELAY_MS)
        }
      }
    }

    console.log(`[populate] Completed. Processed ${keywords.length} keywords, found ${totalPapersFound} papers`)

    return NextResponse.json({
      processed: keywords.length,
      papers_found: totalPapersFound,
      message: `Successfully populated feed with ${totalPapersFound} papers`
    })

  } catch (error) {
    console.error('[populate] Unexpected error:', error)
    return NextResponse.json({
      error: 'Failed to populate personal feed',
      details: error instanceof Error ? error.message : 'Unknown error',
      processed: 0,
      papers_found: 0
    }, { status: 500 })
  }
}
