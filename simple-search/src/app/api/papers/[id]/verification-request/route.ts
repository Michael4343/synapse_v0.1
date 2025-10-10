import { NextRequest, NextResponse } from 'next/server'
import { createClient, supabaseAdmin } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { TABLES } from '@/lib/supabase'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

const VERIFICATION_LABELS: Record<'combined', string> = {
  combined: 'Verification Briefing'
}

type VerificationType = keyof typeof VERIFICATION_LABELS

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

interface VerificationRequestBody {
  verificationType?: 'combined' | 'claims' | 'reproducibility'
  paper?: PaperPayload
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
    ['Citation Count', paper.citation_count !== null && paper.citation_count !== undefined ? String(paper.citation_count) : '—'],
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
        <blockquote style="border-left: 4px solid #cbd5f5; margin: 0.5rem 0; padding: 0.75rem 1rem; background: #f8fafc;">
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

function buildPrompt(paper: PaperPayload): string {
  const title = paper.title || 'Unknown title'
  const doiOrId = paper.doi || paper.scraped_url || paper.url || 'Not provided'
  const authors = formatAuthors(paper.authors)
  const abstractLine = paper.abstract && paper.abstract.trim().length > 0
    ? `- Optional: Abstract: ${paper.abstract.trim()}`
    : '- Optional: Abstract: not provided'

  return [
    'You are running a deep-research pass to gather every detail needed for Evidentia’s reproducibility briefing and method crosswalk. Focus on completeness and factual accuracy rather than polished prose. Use plain English. Avoid domain-specific or medical jargon; prefer general words like "equipment", "materials", "samples", "procedure", "quality checks".',
    '',
    'Inputs',
    `- Title: ${title}`,
    `- DOI or ID: ${doiOrId}`,
    `- Authors: ${authors}`,
    abstractLine,
    '',
    'Output',
    'Produce a detailed research dossier that a human operator can later transform into structured data. Use headings and bullet lists where helpful, but strict formatting is not required.',
    '',
    'Tasks',
    '',
    'PART 1 - Reproducibility (plain language)',
    '',
    '1.1 Overall verdict',
    '- State the overall reproducibility level using the pattern “Highly reproducible for…”, “Moderately reproducible with…”, or “Limited reproducibility due to…”. Add the plain-language gating factor.',
    '',
    '1.2 Feasibility snapshot',
    '- Create 5-7 yes/no capability checks a typical lab or team can use to self-assess.',
    '- Each item must:',
    '  - Start with "Do you have", "Can you", or "Are you equipped to"',
    '  - Target a specific capability, resource, or infrastructure need',
    '  - Include a one-sentence "why this matters" note',
    '  - Be concrete and checkable',
    '- Use general terms. Do not use technical or medical jargon.',
    '- Present as a list so the operator can extract question, importance, and supporting rationale.',
    '',
    'PART 2 - Method & finding crosswalk (build a small related set)',
    '',
    'Goal: Find 3-5 papers whose methods are similar to the input paper. Prioritise method overlap over topic keywords and capture the information needed for Evidentia’s crosswalk.',
    '',
    'Search approach',
    '- Derive neutral method terms from the input (e.g., sample type, preparation steps, equipment class, control style, readout type).',
    '- Create 3-5 search queries that mix these terms with general synonyms.',
    '- Prefer papers that:',
      '  - Clearly describe materials, equipment, steps, controls, readouts, and quality checks',
      '  - Include code, data, or supplementary methods',
      '  - Have non-paywalled summaries when possible',
    '- Keep language plain in all outputs.',
    '',
    'For each selected paper, compile the following details so the operator can later structure them:',
    '- Identifier (Semantic Scholar ID, DOI, or stable hash).',
    '- Title, concise author list (“Surname et al.” for 3+ authors).',
    '- Venue and year.',
    '- Citation count (or note if not reported).',
    '- Cluster label: choose “Sample and model”, “Field deployments”, or “Insight primers” and explain why it fits.',
    '- Two to three sentences summarising why the methods align.',
    '- Highlight line: if the abstract yields a key signal use “Signal from abstract: …”, else “Signal from editorial or summary in <venue>”.',
    '- Matrix covering sampleModel, materialsRatios, equipmentSetup, procedureSteps, controls, outputsMetrics, qualityChecks, outcomeSummary using plain language. Mark any missing info as “not reported”.',
    '',
    'Housekeeping',
    '- Capture sources for every fact (links, DOIs, or figure/table references).',
    '- Note any uncertainties or gaps so the operator can follow up.',
    '- Output format beyond clear headings/lists is flexible—the priority is gathering complete, well-cited information.'
  ].join('\n')
}

function buildPlainText(user: User, paper: PaperPayload, type: VerificationType, timestamp: string): string {
  const authors = formatAuthors(paper.authors)
  const prompt = buildPrompt(paper)

  return [
    `New verification request received`,
    `Type: ${VERIFICATION_LABELS[type]}`,
    `Triggered at: ${timestamp}`,
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
    `  Content Type: ${paper.content_type || '—'}`,
    '',
    'Deep research prompt:',
    prompt
  ].join('\n')
}

function buildEmailHtml(user: User, paper: PaperPayload, type: VerificationType, timestamp: string): string {
  const prompt = buildPrompt(paper)
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">New verification request</h2>
      <p style="margin: 0 0 0.25rem 0;"><strong>Type:</strong> ${escapeHtml(VERIFICATION_LABELS[type])}</p>
      <p style="margin: 0 0 0.75rem 0;"><strong>Triggered at:</strong> ${escapeHtml(timestamp)}</p>

      <h3 style="margin: 1rem 0 0.5rem 0;">User details</h3>
      ${renderUserDetails(user)}

      <h3 style="margin: 1rem 0 0.5rem 0;">Paper details</h3>
      ${renderPaperDetails(paper)}

      <h3 style="margin: 1.25rem 0 0.5rem 0;">Deep research prompt</h3>
      <pre style="white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1rem; font-size: 0.875rem; line-height: 1.5;">
${escapeHtml(prompt)}
      </pre>
    </div>
  `
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

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

  let body: VerificationRequestBody
  try {
    body = await request.json()
  } catch (error) {
    console.error('Failed to parse verification request body:', error)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawVerificationType = body.verificationType ?? 'combined'
  const paperIdIsUuid = isUuid(paperId)

  if (!['combined', 'claims', 'reproducibility'].includes(rawVerificationType)) {
    return NextResponse.json({ error: 'verificationType must be "combined"' }, { status: 400 })
  }

  const resolvedVerificationType: VerificationType = 'combined'

  const paper = body.paper

  if (!paper || typeof paper !== 'object' || paper.id !== paperId) {
    return NextResponse.json({ error: 'Paper details are required and must match the requested paper' }, { status: 400 })
  }

  const timestamp = new Date().toISOString()
  const paperSnapshot = {
    id: paper.id,
    title: paper.title || null,
    authors: Array.isArray(paper.authors) ? paper.authors : null,
    venue: paper.venue || null,
    year: paper.year ?? null,
    doi: paper.doi || null,
    url: paper.url || null
  }

  const { error: insertError } = await supabaseAdmin
    .from(TABLES.VERIFICATION_REQUESTS)
    .insert({
      paper_id: paperIdIsUuid ? paperId : null,
      paper_lookup_id: paperId,
      user_id: user.id,
      verification_type: resolvedVerificationType,
      status: 'pending',
      request_payload: {
        triggered_at: timestamp,
        requested_type: rawVerificationType,
        requested_tracks: ['reproducibility', 'similar_papers'],
        user: {
          id: user.id,
          email: user.email
        },
        paper: paperSnapshot
      }
    })

  if (insertError) {
    console.error('Failed to record verification request:', insertError)
    return NextResponse.json({ error: 'Unable to record verification request' }, { status: 500 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'research-updates@updates.evidentia.bio'
  const deliverTo = process.env.VERIFICATION_ALERT_EMAIL || 'michael@evidentia.bio'

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set – cannot send verification emails.')
    return NextResponse.json({ error: 'Email delivery is not configured' }, { status: 500 })
  }

  if (!resendFromEmail) {
    console.error('RESEND_FROM_EMAIL is not set – cannot send verification emails.')
    return NextResponse.json({ error: 'Email delivery is not configured' }, { status: 500 })
  }

  const resend = new Resend(resendApiKey)

  const html = buildEmailHtml(user, paper, resolvedVerificationType, timestamp)
  const text = buildPlainText(user, paper, resolvedVerificationType, timestamp)

  if (paperIdIsUuid) {
    const { error: statusError } = await supabaseAdmin
      .from(TABLES.SEARCH_RESULTS)
      .update({
        similar_papers_status: 'pending',
        similar_papers_updated_at: timestamp
      })
      .eq('id', paperId)

    if (statusError) {
      console.error('Failed to mark similar papers status as pending:', statusError)
    }
  }

  try {
    const response = await resend.emails.send({
      from: resendFromEmail,
      to: deliverTo,
      subject: `${VERIFICATION_LABELS[resolvedVerificationType]} request for ${paper.title || 'Untitled paper'}`,
      html,
      text
    })

    if (response.error) {
      console.error('Resend API error:', response.error)
      return NextResponse.json({ error: 'Failed to send email notification' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to dispatch verification email:', error)
    return NextResponse.json({ error: 'Failed to send email notification' }, { status: 502 })
  }
}
