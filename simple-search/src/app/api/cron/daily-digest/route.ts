import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { generateDailyDigestEmail } from '@/lib/email-templates/daily-digest'
import { fetchPerplexityRecentPapers, type PerplexityPaperCandidate } from '@/lib/perplexity'
import { enrichPerplexityCandidate } from '@/lib/semantic-scholar-fetch'

const resend = new Resend(process.env.RESEND_API_KEY)

interface Paper {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  semanticScholarId: string
  arxivId: string | null
  doi: string | null
  url: string | null
  source: string
  publicationDate: string | null
}

interface UserProfile {
  id: string
  profile_personalization: {
    manual_keywords?: string[]
  } | null
}

// Protect this endpoint with a secret
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all users with email digest enabled
    const { data: users, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id, profile_personalization')
      .eq('email_digest_enabled', true)

    if (usersError) {
      console.error('Failed to fetch users:', usersError)
      const payload =
        process.env.NODE_ENV !== 'production'
          ? { error: 'Failed to fetch users', details: String(usersError?.message ?? usersError) }
          : { error: 'Failed to fetch users' }
      return NextResponse.json(payload, { status: 500 })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users with email digest enabled', processed: 0 })
    }

    console.log(`Processing daily digest for ${users.length} users`)

    const results = []
    for (const user of users) {
      try {
        const result = await processUserDigest(user as UserProfile)
        results.push(result)
      } catch (error) {
        console.error(`Failed to process digest for user ${user.id}:`, error)
        results.push({ userId: user.id, success: false, error: String(error) })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    return NextResponse.json({
      message: 'Daily digest processing complete',
      total: users.length,
      success: successCount,
      failed: failureCount,
      results
    })
  } catch (error) {
    console.error('Daily digest cron error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function processUserDigest(user: UserProfile) {
  // Get manual keywords from profile
  const manualKeywords = user.profile_personalization?.manual_keywords || []

  if (manualKeywords.length === 0) {
    console.log(`User ${user.id} has no keywords, skipping digest`)
    return { userId: user.id, success: false, error: 'No keywords configured' }
  }

  // Get user's auth data for email
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(user.id)

  if (authError || !authData?.user?.email) {
    console.error(`Failed to get email for user ${user.id}:`, authError)
    return { userId: user.id, success: false, error: 'No email found' }
  }

  const userEmail = authData.user.email
  const userName = authData.user.user_metadata?.name || userEmail.split('@')[0]

  // Generate personal feed (limit to 4 keywords for performance)
  const keywords = manualKeywords.slice(0, 4)
  let digestPapers = await buildDailyPerplexityDigest(keywords)

  let noNewPapers = false

  if (!digestPapers.length) {
    digestPapers = await fetchPersonalFeedFallback(keywords)
    digestPapers = filterRecentPapers(digestPapers, 48)
  }

  if (!digestPapers.length) {
    noNewPapers = true
  }

  // Limit to top 10 papers (may be empty)
  digestPapers = digestPapers.slice(0, 10)

  if (noNewPapers) {
    console.log(`No fresh papers for user ${user.id}, sending no-update notice`)
  }

  // Generate email
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { subject, html } = generateDailyDigestEmail({
    userName,
    papers: digestPapers,
    feedUrl: `${baseUrl}`,
    unsubscribeUrl: `${baseUrl}?unsubscribe=digest`
  })

  // Send email via Resend
  const { data: emailData, error: emailError } = await resend.emails.send({
    from: 'Evidentia <onboarding@resend.dev>',
    to: userEmail,
    subject,
    html
  })

  if (emailError) {
    console.error(`Failed to send email to ${userEmail}:`, emailError)
    return { userId: user.id, success: false, error: emailError.message }
  }

  // Update last_digest_sent_at
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ last_digest_sent_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateError) {
    console.error(`Failed to update last_digest_sent_at for user ${user.id}:`, updateError)
  }

  console.log(`Successfully sent digest to ${userEmail} with ${digestPapers.length} papers`)

  return {
    userId: user.id,
    success: true,
    email: userEmail,
    paperCount: digestPapers.length,
    emailId: emailData?.id,
    noNewPapers
  }
}

async function buildDailyPerplexityDigest(keywords: string[]): Promise<Paper[]> {
  if (!keywords.length) {
    return []
  }

  try {
    const candidates = await fetchPerplexityRecentPapers(keywords.slice(0, 4))
    if (!candidates.length) {
      return []
    }

    const enriched: Paper[] = []
    for (const candidate of candidates) {
      const paper = await enrichPerplexityCandidate(candidate)
      if (paper && isWithinHours(paper.publicationDate, 24)) {
        enriched.push(paper)
        if (enriched.length >= 10) {
          break
        }
        continue
      }

      // Fallback to candidate data when Semantic Scholar is not yet updated
      const fallback = buildFallbackPaper(candidate)
      if (fallback && isWithinHours(fallback.publicationDate, 24)) {
        enriched.push(fallback)

        if (enriched.length >= 10) {
          break
        }
      }

    }

    return enriched
  } catch (error) {
    console.error('Failed to build Perplexity digest', error)
    return []
  }
}

async function fetchPersonalFeedFallback(keywords: string[]): Promise<Paper[]> {
  const allResults: Paper[] = []
  const seenIds = new Set<string>()

  // Sequential queries for each keyword
  for (const keyword of keywords) {
    try {
      const currentYear = new Date().getFullYear()
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword, year: currentYear })
      })

      if (response.ok) {
        const data = await response.json()
        const results = Array.isArray(data.results) ? data.results : []

        // Add unique results
        for (const result of results) {
          if (!seenIds.has(result.id) && allResults.length < 50) {
            allResults.push(result)
            seenIds.add(result.id)
          }
        }
      }
    } catch (error) {
      console.error(`Query failed for keyword "${keyword}":`, error)
    }
  }

  // Sort by publication date (most recent first)
  return allResults.sort((a, b) => {
    if (!a.publicationDate && !b.publicationDate) return 0
    if (!a.publicationDate) return 1
    if (!b.publicationDate) return -1
    return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime()
  })
}

function filterRecentPapers(papers: Paper[], hoursAgo: number): Paper[] {
  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - hoursAgo)

  return papers.filter(paper => {
    if (!paper.publicationDate) return false
    const pubDate = new Date(paper.publicationDate)
    return pubDate >= cutoffDate
  })
}

function isWithinHours(dateString: string | null, hours: number): boolean {
  if (!dateString) {
    return false
  }

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - hours)
  const now = new Date()

  return date >= cutoff && date <= now
}

function buildFallbackPaper(candidate: PerplexityPaperCandidate): Paper | null {
  const publicationDate = candidate.publicationDate ?? null
  const url = candidate.url ?? null
  const doi = candidate.doi ?? null

  if (!url && !doi) {
    return null
  }

  const parsedDate = publicationDate ? new Date(publicationDate) : null
  const year = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getUTCFullYear() : null

  return {
    id: doi || url || candidate.title,
    title: candidate.title,
    abstract: candidate.summary ?? null,
    authors: [],
    year,
    venue: null,
    citationCount: null,
    semanticScholarId: doi || url || candidate.title,
    arxivId: null,
    doi,
    url,
    source: 'perplexity_direct',
    publicationDate,
  }
}
