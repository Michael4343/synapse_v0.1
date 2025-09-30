import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { generateDailyDigestEmail } from '@/lib/email-templates/daily-digest'

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

  const supabase = createServerClient()

  try {
    // Get all users with email digest enabled
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, profile_personalization')
      .eq('email_digest_enabled', true)

    if (usersError) {
      console.error('Failed to fetch users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users with email digest enabled', processed: 0 })
    }

    console.log(`Processing daily digest for ${users.length} users`)

    const results = []
    for (const user of users) {
      try {
        const result = await processUserDigest(user as UserProfile, supabase)
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

async function processUserDigest(user: UserProfile, supabase: any) {
  // Get manual keywords from profile
  const manualKeywords = user.profile_personalization?.manual_keywords || []

  if (manualKeywords.length === 0) {
    console.log(`User ${user.id} has no keywords, skipping digest`)
    return { userId: user.id, success: false, error: 'No keywords configured' }
  }

  // Get user's auth data for email
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(user.id)

  if (authError || !authData?.user?.email) {
    console.error(`Failed to get email for user ${user.id}:`, authError)
    return { userId: user.id, success: false, error: 'No email found' }
  }

  const userEmail = authData.user.email
  const userName = authData.user.user_metadata?.name || userEmail.split('@')[0]

  // Generate personal feed (limit to 4 keywords for performance)
  const keywords = manualKeywords.slice(0, 4)
  const papers = await fetchPersonalFeed(keywords)

  // Filter papers from last 24-48 hours
  const recentPapers = filterRecentPapers(papers, 48)

  if (recentPapers.length === 0) {
    console.log(`No recent papers for user ${user.id}, skipping email`)
    return { userId: user.id, success: true, skipped: true, reason: 'No new papers' }
  }

  // Limit to top 10 papers
  const digestPapers = recentPapers.slice(0, 10)

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
  const { error: updateError } = await supabase
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
    emailId: emailData?.id
  }
}

async function fetchPersonalFeed(keywords: string[]): Promise<Paper[]> {
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