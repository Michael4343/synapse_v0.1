import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
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
  url: string | null
  publicationDate: string | null
}

// Test endpoint - sends digest to current authenticated user
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('profile_personalization')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }

    // Get manual keywords
    const manualKeywords = profile?.profile_personalization?.manual_keywords || []

    if (manualKeywords.length === 0) {
      return NextResponse.json({
        error: 'No keywords configured in your profile. Add keywords to test the digest.'
      }, { status: 400 })
    }

    const userEmail = user.email!
    const userName = user.user_metadata?.name || userEmail.split('@')[0]

    // Generate personal feed (limit to 4 keywords)
    const keywords = manualKeywords.slice(0, 4)
    const papers = await fetchPersonalFeed(keywords)

    if (papers.length === 0) {
      return NextResponse.json({
        error: 'No papers found for your keywords'
      }, { status: 400 })
    }

    // For testing, just take top 10 papers (don't filter by date)
    const digestPapers = papers.slice(0, 10)

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
      subject: `[TEST] ${subject}`,
      html
    })

    if (emailError) {
      console.error('Failed to send test digest:', emailError)
      return NextResponse.json({ error: 'Failed to send email', details: emailError }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Test digest sent to ${userEmail}`,
      paperCount: digestPapers.length,
      emailId: emailData?.id
    })
  } catch (error) {
    console.error('Test digest error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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