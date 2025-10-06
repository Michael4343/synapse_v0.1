import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient, supabaseAdmin } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'
import { TABLES } from '@/lib/supabase'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

interface PaperPayload {
  id: string
  title?: string | null
  authors?: string[] | null
  abstract?: string | null
  year?: number | null
  venue?: string | null
  citation_count?: number | null
  doi?: string | null
  url?: string | null
  scraped_url?: string | null
  content_quality?: string | null
  content_type?: string | null
}

interface CommunityReviewRequestBody {
  paper?: PaperPayload
  source?: 'claims' | 'reproducibility'
}

function escapeHtml(value: unknown): string {
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

function formatAuthors(authors?: string[] | null): string {
  if (!Array.isArray(authors) || authors.length === 0) {
    return 'Not provided'
  }
  return authors.join(', ')
}

function renderPaperDetails(paper: PaperPayload): string {
  const rows: Array<[string, string]> = [
    ['Paper ID', paper.id],
    ['Title', paper.title || 'Untitled paper'],
    ['Authors', formatAuthors(paper.authors)],
    ['Venue', paper.venue || '—'],
    ['Year', paper.year ? String(paper.year) : '—'],
    [
      'Citation Count',
      paper.citation_count !== null && paper.citation_count !== undefined
        ? String(paper.citation_count)
        : '—'
    ],
    ['DOI', paper.doi || '—'],
    ['Primary URL', paper.url || '—'],
    ['Scraped URL', paper.scraped_url || '—'],
    ['Content Quality', paper.content_quality || '—'],
    ['Content Type', paper.content_type || '—']
  ]

  const listItems = rows
    .map(([label, value]) => `
      <li>
        <strong>${escapeHtml(label)}:</strong>
        <span style="margin-left: 0.25rem;">${escapeHtml(value)}</span>
      </li>
    `)
    .join('\n')

  const abstractBlock = paper.abstract
    ? `
        <p style="margin-top: 1rem;">
          <strong>Abstract</strong>
        </p>
        <blockquote style="border-left: 4px solid #a855f7; margin: 0.5rem 0; padding: 0.75rem 1rem; background: #faf5ff;">
          ${escapeHtml(paper.abstract)}
        </blockquote>
      `
    : ''

  return `
    <ul style="padding-left: 1.25rem; margin: 0; list-style: disc;">
      ${listItems}
    </ul>
    ${abstractBlock}
  `
}

function renderUserDetails(user: User): string {
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || null

  return `
    <ul style="padding-left: 1.25rem; margin: 0; list-style: disc;">
      <li><strong>User ID:</strong> <span style="margin-left: 0.25rem;">${escapeHtml(user.id)}</span></li>
      <li><strong>Email:</strong> <span style="margin-left: 0.25rem;">${escapeHtml(user.email)}</span></li>
      <li><strong>Name:</strong> <span style="margin-left: 0.25rem;">${escapeHtml(displayName || 'Not provided')}</span></li>
    </ul>
  `
}

function buildEmailHtml(
  user: User,
  paper: PaperPayload,
  timestamp: string,
  source: CommunityReviewRequestBody['source']
): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">Community review request received</h2>
      <p style="margin: 0 0 0.25rem 0;"><strong>Triggered at:</strong> ${escapeHtml(timestamp)}</p>
      <p style="margin: 0 0 0.75rem 0;"><strong>Submitted from:</strong> ${escapeHtml(source || 'unspecified tab')}</p>

      <h3 style="margin: 1rem 0 0.5rem 0;">User details</h3>
      ${renderUserDetails(user)}

      <h3 style="margin: 1rem 0 0.5rem 0;">Paper details</h3>
      ${renderPaperDetails(paper)}
    </div>
  `
}

function buildEmailText(
  user: User,
  paper: PaperPayload,
  timestamp: string,
  source: CommunityReviewRequestBody['source']
): string {
  const authors = formatAuthors(paper.authors)

  return [
    'Community review request received',
    `Triggered at: ${timestamp}`,
    `Submitted from: ${source || 'unspecified tab'}`,
    '',
    'User',
    `  ID: ${user.id}`,
    `  Email: ${user.email || 'Not provided'}`,
    `  Name: ${user.user_metadata?.full_name || user.user_metadata?.name || 'Not provided'}`,
    '',
    'Paper',
    `  ID: ${paper.id}`,
    `  Title: ${paper.title || 'Untitled paper'}`,
    `  Authors: ${authors}`,
    `  Venue: ${paper.venue || '—'}`,
    `  Year: ${paper.year ?? '—'}`,
    `  Citation Count: ${paper.citation_count ?? '—'}`,
    `  DOI: ${paper.doi || '—'}`,
    `  Primary URL: ${paper.url || '—'}`,
    `  Scraped URL: ${paper.scraped_url || '—'}`,
    `  Content Quality: ${paper.content_quality || '—'}`,
    `  Content Type: ${paper.content_type || '—'}`
  ].join('\n')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let paperId: string
  try {
    const resolvedParams = await params
    paperId = resolvedParams.id
  } catch (error) {
    console.error('Failed to resolve params:', error)
    return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
  }

  let body: CommunityReviewRequestBody
  try {
    body = await request.json()
  } catch (error) {
    console.error('Failed to parse community review request body:', error)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const paper = body.paper
  if (!paper || typeof paper !== 'object' || paper.id !== paperId) {
    return NextResponse.json({ error: 'Paper details are required and must match the requested paper' }, { status: 400 })
  }

  const timestamp = new Date().toISOString()
  const paperIsUuid = isUuid(paperId)

  try {
    const { data: existingRequest, error: existingError } = await supabaseAdmin
      .from(TABLES.COMMUNITY_REVIEW_REQUESTS)
      .select('id, status, created_at')
      .eq('paper_lookup_id', paperId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Failed to check existing community review requests:', existingError)
      return NextResponse.json({ error: 'Unable to process request' }, { status: 500 })
    }

    if (existingRequest) {
      return NextResponse.json({ success: true, alreadyExists: true, requestId: existingRequest.id })
    }
  } catch (error) {
    console.error('Failed to check community review request duplication:', error)
    return NextResponse.json({ error: 'Unable to process request' }, { status: 500 })
  }

  const requestPayload = {
    triggered_at: timestamp,
    source: body.source ?? null,
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || null
    },
    paper: {
      id: paper.id,
      title: paper.title || null,
      authors: Array.isArray(paper.authors) ? paper.authors : null,
      venue: paper.venue || null,
      year: paper.year ?? null,
      doi: paper.doi || null,
      url: paper.url || null
    }
  }

  const { error: insertError } = await supabaseAdmin
    .from(TABLES.COMMUNITY_REVIEW_REQUESTS)
    .insert({
      paper_id: paperIsUuid ? paperId : null,
      paper_lookup_id: paperId,
      user_id: user.id,
      status: 'pending',
      request_payload: requestPayload
    })

  if (insertError) {
    console.error('Failed to record community review request:', insertError)
    return NextResponse.json({ error: 'Unable to record community review request' }, { status: 500 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'research-updates@updates.evidentia.bio'
  const deliverTo =
    process.env.COMMUNITY_REVIEW_ALERT_EMAIL ||
    process.env.VERIFICATION_ALERT_EMAIL ||
    'michael@evidentia.bio'

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set – cannot send community review emails.')
    return NextResponse.json({ error: 'Email delivery is not configured' }, { status: 500 })
  }

  if (!resendFromEmail) {
    console.error('RESEND_FROM_EMAIL is not set – cannot send community review emails.')
    return NextResponse.json({ error: 'Email delivery is not configured' }, { status: 500 })
  }

  const resend = new Resend(resendApiKey)

  const html = buildEmailHtml(user, paper, timestamp, body.source)
  const text = buildEmailText(user, paper, timestamp, body.source)

  try {
    const response = await resend.emails.send({
      from: resendFromEmail,
      to: deliverTo,
      subject: `Community review request for ${paper.title || 'Untitled paper'}`,
      html,
      text
    })

    if (response.error) {
      console.error('Resend API error:', response.error)
      return NextResponse.json({ error: 'Failed to send email notification' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to dispatch community review email:', error)
    return NextResponse.json({ error: 'Failed to send email notification' }, { status: 502 })
  }
}
