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

  return [
    'Analyze the following academic paper to assess reproducibility feasibility and verify key claims:',
    `Paper Title: ${title}`,
    `Paper ID/DOI: ${doiOrId}`,
    `Authors: ${authors}`,
    '',
    'PART 1: REPRODUCIBILITY ASSESSMENT',
    '1.1 Overall Verdict',
    'Provide a single-sentence verdict that captures:',
    '',
    'Overall reproducibility level (e.g., "Highly reproducible for...", "Moderately reproducible with...", "Limited reproducibility due to...")',
    'The main challenge or gating factor',
    '',
    'Example: "Highly reproducible for well-equipped molecular biology labs. Main challenge is capital investment and specialized expertise for multi-step Cas9 protein purification."',
    '',
    '1.2 Feasibility Snapshot',
    'Generate 5-7 specific yes/no questions that labs can use to self-assess readiness. Each question should:',
    '',
    'Start with action verbs: "Do you have...", "Can you...", "Are you equipped to..."',
    'Target a specific capability, resource, or infrastructure requirement',
    'Include a brief justification (1 sentence) explaining why it matters for this paper',
    'Be concrete and checkable (avoid vague questions)',
    '',
    'Format:',
    '**[Question phrased as yes/no capability check]**',
    '[One-sentence context explaining why this specific capability is needed]',
    'Example:',
    '**Do you maintain human iPSC-derived neurons or comparable VCP disease models?**',
    'Authors relied on patient-derived cortical neurons; organoids are acceptable with baseline QC.',
    '',
    '1.3 Critical Path',
    'Identify 3-5 major phases needed to reproduce the work. For each phase:',
    'Phase Name: [Concise, action-oriented name]',
    'Key Deliverable: [What you produce/achieve - be specific]',
    'Checklist: [3-5 concrete action items as bullet points]',
    '',
    'Use actionable language',
    'Each item should be verifiable',
    '',
    'Primary Risk:',
    '',
    'Severity: [Critical / Moderate / Minor]',
    '[Risk description in plain language - what could go wrong]',
    'Mitigation: [Practical strategy to address or work around the risk]',
    '',
    '(Optional: Include estimated timeline/cost only if clearly derivable from the paper)',
    '',
    'PART 2: CLAIMS VERIFICATION',
    '2.1 Headline Finding',
    '',
    'Claim: [Extract the paper\'s most important or novel finding - one sentence]',
    'Source: [Specific location: "Figure 3A", "Supplementary Table 2", etc.]',
    '',
    '',
    '2.2 Primary Open Question',
    '',
    'Question: [What is the biggest uncertainty, methodological gap, or missing information?]',
    'Impact: [Why does this matter? What\'s at stake if this gap is significant?]',
    '',
    '',
    '2.3 Evidence We Stand Behind',
    'Identify 3-5 claims with strong supporting evidence:',
    'Format:',
    '',
    '[Claim statement]',
    '',
    'Source: [Specific reference]',
    'Confidence: [verified / inferred / uncertain]',
    '[Optional: Brief note on why evidence is strong]',
    '',
    '',
    '',
    '2.4 Gaps and Follow-ups',
    'Identify 3-5 areas where evidence is weak, missing, or unclear:',
    'Format:',
    '',
    '[What\'s missing or uncertain]',
    '',
    'Impact: [Why it matters for reproducibility or interpretation]',
    'Severity: [critical / moderate / minor]',
    '[Note whether this requires expert outreach or can be tracked internally]',
    '',
    '',
    '',
    '2.5 Assumptions We Made',
    'List 3-5 key assumptions you made during analysis, including:',
    '',
    'Assumptions about lab capabilities (e.g., "Lab has uninterrupted incubator access")',
    'Scope limitations (e.g., "In vivo validation is out of scope")',
    'Interpretations where paper is ambiguous',
    '',
    '',
    'RESEARCH PROTOCOL',
    'Sources to Prioritize:',
    '',
    'Full paper text + all supplementary materials',
    'Code repositories (GitHub, GitLab, Zenodo)',
    'Public datasets (GEO, ProteomeXchange, Dryad, etc.)',
    'Methods citations (papers referenced for protocols)',
    'Author resources (lab websites, protocol repositories)',
    'Vendor documentation (reagent datasheets, equipment specs)',
    'Community discussion (PubPeer, bioRxiv comments, relevant forums)',
    '',
    'Analysis Standards:',
    '✓ Be specific: Always cite exact locations ("Figure 2C", not "the paper mentions")',
    '✓ Distinguish facts from inference: Mark what\'s explicitly stated vs. what you inferred',
    '✓ Flag information gaps: Explicitly note where information is missing or unclear',
    '✓ Use practical language: Write for lab scientists making decisions, not reviewers',
    '✓ Prioritize actionability: Focus on concrete, verifiable information over speculation',
    '✓ Check for updates: Look for corrigenda, author responses, or updated protocols',
    'Verification Hierarchy:',
    '',
    'Verified: Explicitly stated in paper/supplements with clear supporting data',
    'Inferred: Logically derived from available information but not directly stated',
    'Uncertain: Unclear, contradictory, or insufficient information to determine'
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
        requested_tracks: ['reproducibility', 'claims'],
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
