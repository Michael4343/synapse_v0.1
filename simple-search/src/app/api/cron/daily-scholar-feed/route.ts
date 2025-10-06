import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { fetchPapersForKeyword, delay, SCRAPER_DELAY_MS, uniqueKeywords } from '@/lib/scholar-scraper'
import { Resend } from 'resend'

const MAX_RESULTS_PER_KEYWORD = 12
const FETCH_WINDOW_DAYS = 7

interface Researcher {
  id: string
  display_name: string | null
  contact_email: string | null
  research_interests: string[] | null
}

function escapeHtml(value: string | null | undefined): string {
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

async function sendEmailSummary(
  researcher: Researcher,
  queryCounts: Map<string, number>,
  resendClient: Resend | null
) {
  const resendFromEmail = process.env.RESEND_FROM_EMAIL
  const feedUrl = process.env.RESEARCH_FEED_URL

  if (!resendClient || !resendFromEmail) {
    console.log(`[daily-scholar-feed] Skipping email for ${researcher.display_name}: Resend not configured`)
    return
  }

  const recipient = (researcher.contact_email || '').trim()
  if (!recipient) {
    console.log(`[daily-scholar-feed] Skipping email for ${researcher.display_name}: No contact email`)
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

  if (feedUrl) {
    htmlParts.push(`<p><a href="${escapeHtml(feedUrl)}">Open your research feed</a> to read the details.</p>`)
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
    feedUrl ? `Open your research feed: ${feedUrl}` : 'Sign in to your research feed to read the details.',
    '',
    '— Evidentia'
  ]

  try {
    const { data, error } = await resendClient.emails.send({
      from: resendFromEmail,
      to: recipient,
      subject,
      html: htmlParts.join('\n'),
      text: textParts.join('\n')
    })

    if (error) {
      console.error(`[daily-scholar-feed] Failed to send email to ${recipient}:`, error.message)
      return
    }

    const id = data?.id ? ` (id: ${data.id})` : ''
    console.log(`[daily-scholar-feed] Sent email notification to ${recipient} (${totalNew} new)${id}`)
  } catch (error) {
    console.error(
      `[daily-scholar-feed] Failed to send email to ${recipient}:`,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET authorization
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[daily-scholar-feed] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron job not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[daily-scholar-feed] Unauthorized: Invalid authorization header')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check for required API keys
  const scraperApiKey = process.env.SCRAPERAPI_KEY
  if (!scraperApiKey) {
    console.error('[daily-scholar-feed] SCRAPERAPI_KEY not configured')
    return NextResponse.json({
      error: 'SCRAPERAPI_KEY not configured',
      processed: 0,
      papers_found: 0
    }, { status: 500 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const resendClient = resendApiKey ? new Resend(resendApiKey) : null

  if (!resendApiKey) {
    console.log('[daily-scholar-feed] RESEND_API_KEY not set. Email notifications will be skipped.')
  }

  console.log('[daily-scholar-feed] Starting daily scholar feed cron job')

  try {
    // Fetch all active researchers
    const { data: researchers, error: fetchError } = await supabaseAdmin
      .from('researchers')
      .select('id, display_name, contact_email, research_interests')
      .eq('status', 'active')
      .order('display_name', { ascending: true })

    if (fetchError) {
      console.error('[daily-scholar-feed] Failed to fetch researchers:', fetchError)
      return NextResponse.json({
        error: 'Failed to fetch researchers',
        details: fetchError.message,
        processed: 0,
        papers_found: 0
      }, { status: 500 })
    }

    if (!researchers || researchers.length === 0) {
      console.log('[daily-scholar-feed] No active researchers found')
      return NextResponse.json({
        message: 'No active researchers found',
        processed: 0,
        papers_found: 0
      })
    }

    console.log(`[daily-scholar-feed] Processing ${researchers.length} researcher(s)`)

    let totalProcessed = 0
    let totalPapersFound = 0
    const results = []

    // Process each researcher
    for (const researcher of researchers) {
      const keywords = uniqueKeywords(researcher.research_interests || [])

      if (keywords.length === 0) {
        console.log(`[daily-scholar-feed] Skipping ${researcher.display_name}: No keywords`)
        results.push({
          researcher_id: researcher.id,
          display_name: researcher.display_name,
          status: 'skipped',
          reason: 'No keywords'
        })
        continue
      }

      // Limit to 5 keywords to avoid excessive scraping
      const limitedKeywords = keywords.slice(0, 5)
      const queryCounts = new Map<string, number>()

      console.log(`[daily-scholar-feed] Processing ${researcher.display_name} with ${limitedKeywords.length} keyword(s)`)

      try {
        // Delete old papers (older than 30 days) for this user
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const { error: deleteError } = await supabaseAdmin
          .from('personal_feed_papers')
          .delete()
          .eq('user_id', researcher.id)
          .lt('scraped_at', thirtyDaysAgo)

        if (deleteError) {
          console.error(`[daily-scholar-feed] Failed to delete old papers for ${researcher.display_name}:`, deleteError)
        }

        const seenUrls = new Set<string>()
        let researcherPapersFound = 0

        // Process each keyword sequentially
        for (let i = 0; i < limitedKeywords.length; i++) {
          const keyword = limitedKeywords[i]
          console.log(`[daily-scholar-feed] Processing keyword ${i + 1}/${limitedKeywords.length} for ${researcher.display_name}: "${keyword}"`)

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
                user_id: researcher.id,
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
                console.error(`[daily-scholar-feed] Failed to insert papers for keyword "${keyword}":`, insertError)
              } else {
                researcherPapersFound += papersToInsert.length
                queryCounts.set(keyword, papersToInsert.length)
                console.log(`[daily-scholar-feed] Inserted ${papersToInsert.length} papers for keyword "${keyword}"`)
              }
            } else {
              console.log(`[daily-scholar-feed] No papers found for keyword "${keyword}"`)
              queryCounts.set(keyword, 0)
            }

            // Delay before next keyword (except after last one)
            if (i < limitedKeywords.length - 1) {
              await delay(SCRAPER_DELAY_MS)
            }

          } catch (error) {
            console.error(`[daily-scholar-feed] Error processing keyword "${keyword}":`, error)
            queryCounts.set(keyword, 0)

            // Still delay before next keyword to avoid rate limiting
            if (i < limitedKeywords.length - 1) {
              await delay(SCRAPER_DELAY_MS)
            }
          }
        }

        // Send email summary
        await sendEmailSummary(researcher, queryCounts, resendClient)

        totalProcessed++
        totalPapersFound += researcherPapersFound

        results.push({
          researcher_id: researcher.id,
          display_name: researcher.display_name,
          status: 'success',
          keywords_processed: limitedKeywords.length,
          papers_found: researcherPapersFound,
          query_counts: Object.fromEntries(queryCounts)
        })

        console.log(`[daily-scholar-feed] Completed ${researcher.display_name}: ${researcherPapersFound} papers found`)

      } catch (error) {
        console.error(`[daily-scholar-feed] Failed to process ${researcher.display_name}:`, error)
        results.push({
          researcher_id: researcher.id,
          display_name: researcher.display_name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`[daily-scholar-feed] Completed: ${totalProcessed}/${researchers.length} researchers processed, ${totalPapersFound} total papers found`)

    return NextResponse.json({
      message: 'Daily scholar feed completed',
      processed: totalProcessed,
      total_researchers: researchers.length,
      papers_found: totalPapersFound,
      results
    })

  } catch (error) {
    console.error('[daily-scholar-feed] Unexpected error:', error)
    return NextResponse.json({
      error: 'Failed to run daily scholar feed',
      details: error instanceof Error ? error.message : 'Unknown error',
      processed: 0,
      papers_found: 0
    }, { status: 500 })
  }
}
