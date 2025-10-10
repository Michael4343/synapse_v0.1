import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { fetchPapersForKeyword, delay, SEMANTIC_SCHOLAR_DELAY_MS, uniqueKeywords } from '@/lib/scholar-scraper'
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

async function sendReminderEmail(
  researcher: Researcher,
  resendClient: Resend | null
) {
  const resendFromEmail = process.env.RESEND_FROM_EMAIL
  const feedUrl = process.env.RESEARCH_FEED_URL

  if (!resendClient || !resendFromEmail) {
    console.log(`[daily-scholar-feed] ❌ REMINDER SKIPPED: ${researcher.display_name} - Resend not configured`)
    return false
  }

  const recipient = (researcher.contact_email || '').trim()
  if (!recipient) {
    console.log(`[daily-scholar-feed] ❌ REMINDER SKIPPED: ${researcher.display_name} - No contact email`)
    return false
  }

  const displayName = (researcher.display_name || '').trim()
  const firstName = displayName ? displayName.split(' ')[0] : 'there'

  const subject = 'Set up your research feed preferences'

  console.log(`[daily-scholar-feed] 📧 SENDING REMINDER EMAIL:`)
  console.log(`   → To: ${researcher.display_name} <${recipient}>`)
  console.log(`   → Subject: ${subject}`)
  console.log(`   → Reason: No keywords saved`)

  const htmlParts = [
    `<p>Hi ${escapeHtml(firstName)},</p>`,
    `<p>You're currently missing out on personalized research updates because you haven't saved your research interests yet.</p>`,
    `<p>Add a few keywords to your profile to start receiving daily updates about the latest papers in your field.</p>`
  ]

  if (feedUrl) {
    htmlParts.push(`<p><a href="${escapeHtml(feedUrl)}">Update your profile preferences</a> to get started.</p>`)
  } else {
    htmlParts.push('<p>Sign in and update your profile preferences to get started.</p>')
  }

  htmlParts.push('<p>— Evidentia</p>')

  const textParts = [
    `Hi ${firstName},`,
    '',
    `You're currently missing out on personalized research updates because you haven't saved your research interests yet.`,
    '',
    'Add a few keywords to your profile to start receiving daily updates about the latest papers in your field.',
    '',
    feedUrl ? `Update your profile preferences: ${feedUrl}` : 'Sign in and update your profile preferences to get started.',
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
      console.error(`[daily-scholar-feed] ❌ REMINDER FAILED: ${recipient} - ${error.message}`)
      return false
    }

    const id = data?.id || 'unknown'
    console.log(`[daily-scholar-feed] ✅ REMINDER SENT: ${recipient} (Resend ID: ${id})`)
    return true
  } catch (error) {
    console.error(
      `[daily-scholar-feed] ❌ REMINDER ERROR: ${recipient} - ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return false
  }
}

async function sendEmailSummary(
  researcher: Researcher,
  queryCounts: Map<string, number>,
  resendClient: Resend | null
) {
  const resendFromEmail = process.env.RESEND_FROM_EMAIL
  const feedUrl = process.env.RESEARCH_FEED_URL

  if (!resendClient || !resendFromEmail) {
    console.log(`[daily-scholar-feed] ❌ SUMMARY SKIPPED: ${researcher.display_name} - Resend not configured`)
    return
  }

  const recipient = (researcher.contact_email || '').trim()
  if (!recipient) {
    console.log(`[daily-scholar-feed] ❌ SUMMARY SKIPPED: ${researcher.display_name} - No contact email`)
    return
  }

  const entries = Array.from(queryCounts.entries())
  if (entries.length === 0) {
    console.log(`[daily-scholar-feed] ⏭️  SUMMARY SKIPPED: ${researcher.display_name} - No query results`)
    return
  }

  const totalNew = entries.reduce((sum, [, count]) => sum + (count || 0), 0)
  if (totalNew === 0) {
    console.log(`[daily-scholar-feed] ⏭️  SUMMARY SKIPPED: ${researcher.display_name} - 0 papers found`)
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

  console.log(`[daily-scholar-feed] 📧 SENDING PAPER SUMMARY:`)
  console.log(`   → To: ${researcher.display_name} <${recipient}>`)
  console.log(`   → Subject: ${subject}`)
  console.log(`   → Papers: ${totalNew} total across ${entries.length} keyword${entries.length === 1 ? '' : 's'}`)
  entries.forEach(([query, count]) => {
    console.log(`      • "${query}": ${count} paper${count === 1 ? '' : 's'}`)
  })

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
      console.error(`[daily-scholar-feed] ❌ SUMMARY FAILED: ${recipient} - ${error.message}`)
      return
    }

    const id = data?.id || 'unknown'
    console.log(`[daily-scholar-feed] ✅ SUMMARY SENT: ${recipient} (Resend ID: ${id})`)
  } catch (error) {
    console.error(
      `[daily-scholar-feed] ❌ SUMMARY ERROR: ${recipient} - ${error instanceof Error ? error.message : 'Unknown error'}`
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
  const semanticScholarApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY
  if (!semanticScholarApiKey) {
    console.error('[daily-scholar-feed] SEMANTIC_SCHOLAR_API_KEY not configured')
    return NextResponse.json({
      error: 'SEMANTIC_SCHOLAR_API_KEY not configured',
      processed: 0,
      papers_found: 0
    }, { status: 500 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const resendClient = resendApiKey ? new Resend(resendApiKey) : null

  if (!resendApiKey) {
    console.log('[daily-scholar-feed] RESEND_API_KEY not set. Email notifications will be skipped.')
  }

  console.log(`\n[daily-scholar-feed] ═══════════════════════════════════════════════════`)
  console.log(`[daily-scholar-feed] 🚀 STARTING DAILY SCHOLAR FEED CRON JOB`)
  console.log(`[daily-scholar-feed] ⏰ Timestamp: ${new Date().toISOString()}`)
  console.log(`[daily-scholar-feed] ═══════════════════════════════════════════════════\n`)

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
    let totalRemindersSent = 0
    const results = []

    // Process each researcher
    for (const researcher of researchers) {
      const keywords = uniqueKeywords(researcher.research_interests || [])

      if (keywords.length === 0) {
        console.log(`\n[daily-scholar-feed] ──────────────────────────────────────────────────`)
        console.log(`[daily-scholar-feed] 🔍 Processing: ${researcher.display_name}`)
        console.log(`[daily-scholar-feed] ⚠️  Status: No keywords saved`)
        const reminderSent = await sendReminderEmail(researcher, resendClient)
        if (reminderSent) {
          totalRemindersSent++
        }
        console.log(`[daily-scholar-feed] ──────────────────────────────────────────────────\n`)
        results.push({
          researcher_id: researcher.id,
          display_name: researcher.display_name,
          status: reminderSent ? 'reminder_sent' : 'skipped',
          reason: reminderSent ? 'No keywords - reminder sent' : 'No keywords - reminder failed'
        })
        continue
      }

      // Limit to 5 keywords to avoid excessive scraping
      const limitedKeywords = keywords.slice(0, 5)

      console.log(`\n[daily-scholar-feed] ──────────────────────────────────────────────────`)
      console.log(`[daily-scholar-feed] 🔍 Processing: ${researcher.display_name}`)
      console.log(`[daily-scholar-feed] 🔑 Keywords: ${limitedKeywords.join(', ')}`)

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

        const runKeywordPass = async (
          windowDays: number
        ): Promise<{ papersFound: number; counts: Map<string, number> }> => {
          let papersFound = 0
          const counts = new Map<string, number>()
          const seenUrls = new Set<string>()

          for (let i = 0; i < limitedKeywords.length; i++) {
            const keyword = limitedKeywords[i]
            console.log(`[daily-scholar-feed] (${windowDays}d) Processing keyword ${i + 1}/${limitedKeywords.length} for ${researcher.display_name}: "${keyword}"`)

            try {
              const papers = await fetchPapersForKeyword(keyword, semanticScholarApiKey, windowDays)

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

              if (papersToInsert.length > 0) {
                const { error: insertError } = await supabaseAdmin
                  .from('personal_feed_papers')
                  .insert(papersToInsert)

                if (insertError) {
                  console.error(`[daily-scholar-feed] Failed to insert papers for keyword "${keyword}" (${windowDays}d):`, insertError)
                  counts.set(keyword, 0)
                } else {
                  papersFound += papersToInsert.length
                  counts.set(keyword, papersToInsert.length)
                  console.log(`[daily-scholar-feed] Inserted ${papersToInsert.length} papers for keyword "${keyword}" (${windowDays}d)`)
                }
              } else {
                console.log(`[daily-scholar-feed] No papers found for keyword "${keyword}" (${windowDays}d)`)
                counts.set(keyword, 0)
              }

              if (i < limitedKeywords.length - 1) {
                await delay(SEMANTIC_SCHOLAR_DELAY_MS)
              }

            } catch (error) {
              console.error(`[daily-scholar-feed] Error processing keyword "${keyword}" (${windowDays}d):`, error)
              counts.set(keyword, 0)

              if (i < limitedKeywords.length - 1) {
                await delay(SEMANTIC_SCHOLAR_DELAY_MS)
              }
            }
          }

          return { papersFound, counts }
        }

        const firstPass = await runKeywordPass(30)
        let researcherPapersFound = firstPass.papersFound
        let passQueryCounts = firstPass.counts

        if (researcherPapersFound === 0 && limitedKeywords.length > 0) {
          console.log(`[daily-scholar-feed] ${researcher.display_name}: No papers found within 30 days. Retrying with 90-day window.`)
          const fallbackPass = await runKeywordPass(90)
          researcherPapersFound = fallbackPass.papersFound
          passQueryCounts = fallbackPass.counts
        }

        const queryCounts = passQueryCounts

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

        console.log(`[daily-scholar-feed] ✅ Completed: ${researcherPapersFound} papers found for ${researcher.display_name}`)
        console.log(`[daily-scholar-feed] ──────────────────────────────────────────────────\n`)

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

    console.log(`\n[daily-scholar-feed] ═══════════════════════════════════════════════════`)
    console.log(`[daily-scholar-feed] 📊 DAILY SCHOLAR FEED COMPLETED`)
    console.log(`[daily-scholar-feed] ═══════════════════════════════════════════════════`)
    console.log(`[daily-scholar-feed] 👥 Researchers processed: ${totalProcessed}/${researchers.length}`)
    console.log(`[daily-scholar-feed] 📄 Papers found: ${totalPapersFound}`)
    console.log(`[daily-scholar-feed] 🔔 Reminder emails sent: ${totalRemindersSent}`)
    console.log(`[daily-scholar-feed] ═══════════════════════════════════════════════════\n`)

    return NextResponse.json({
      message: 'Daily scholar feed completed',
      processed: totalProcessed,
      total_researchers: researchers.length,
      papers_found: totalPapersFound,
      reminders_sent: totalRemindersSent,
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
