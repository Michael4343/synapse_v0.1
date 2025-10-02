import { NextRequest, NextResponse } from 'next/server'
import { runPerplexityDeepResearch } from '@/lib/perplexity-deep-research'
import {
  buildReproducibilityResponseFormat,
  createFallbackReproducibilityPayload,
  normaliseReproducibilityPayload,
  type VerifyReproducibilityPayload
} from '@/lib/reproducibility-report'

interface PaperSummary {
  id: string
  title: string
  abstract?: string
  authors?: string[]
  venue?: string
  year?: number
  scrapedContent?: string
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: paperId } = await context.params

  if (!paperId) {
    return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
  }

  const paper = await fetchPaper(request, paperId)
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
  }

  const perplexityKey = process.env.PERPLEXITY_API_KEY
  const query = buildResearchQuery(paper)

  let payload: VerifyReproducibilityPayload
  const startedAt = Date.now()

  if (!perplexityKey) {
    payload = createFallbackReproducibilityPayload({
      paperId,
      paperTitle: paper.title,
      query,
      durationMs: Date.now() - startedAt,
      reason: 'Perplexity Deep Research API key is not configured.'
    })
    logOutcome(paperId, payload)
    return NextResponse.json({ report: payload })
  }

  const responseSchema = buildReproducibilityResponseFormat()
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(paper)
  const researchResult = await runPerplexityDeepResearch({
    apiKey: perplexityKey,
    systemPrompt,
    userPrompt,
    responseSchema,
    timeoutMs: 30_000,
    maxRetries: 2
  })

  if (researchResult.ok) {
    payload = normaliseReproducibilityPayload({
      paperId,
      query,
      durationMs: researchResult.durationMs,
      citations: researchResult.citations,
      raw: researchResult.parsed
    })
  } else {
    payload = createFallbackReproducibilityPayload({
      paperId,
      paperTitle: paper.title,
      query,
      durationMs: researchResult.durationMs || Date.now() - startedAt,
      reason: `Perplexity Deep Research returned an error: ${researchResult.error}`
    })
  }

  logOutcome(paperId, payload)
  return NextResponse.json({ report: payload })
}

async function fetchPaper(request: NextRequest, paperId: string): Promise<PaperSummary | null> {
  try {
    const response = await fetch(`${request.nextUrl.origin}/api/papers/${paperId}`, {
      headers: {
        cookie: request.headers.get('cookie') || ''
      }
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return {
      id: data?.id || data?.semanticScholarId || paperId,
      title: data?.title || 'Untitled paper',
      abstract: typeof data?.abstract === 'string' ? data.abstract : undefined,
      authors: Array.isArray(data?.authors) ? data.authors : undefined,
      venue: typeof data?.venue === 'string' ? data.venue : undefined,
      year: typeof data?.year === 'number' ? data.year : undefined,
      scrapedContent: typeof data?.scrapedContent === 'string' ? data.scrapedContent : undefined
    }
  } catch (error) {
    console.error('Failed to fetch paper details for reproducibility analysis', error)
    return null
  }
}

function buildResearchQuery(paper: PaperSummary): string {
  const parts: string[] = [paper.title]
  if (paper.authors?.length) {
    parts.push(`Authors: ${paper.authors.slice(0, 6).join(', ')}`)
  }
  if (paper.venue) {
    parts.push(`Venue: ${paper.venue}${paper.year ? ` (${paper.year})` : ''}`)
  }
  if (paper.abstract) {
    parts.push(`Abstract: ${paper.abstract.slice(0, 400)}`)
  }
  return parts.join(' | ')
}

function buildSystemPrompt(): string {
  return [
    'You are a meticulous research assistant helping Australian labs assess reproducibility.',
    'Use Australian English spelling at all times.',
    'Only include claims when you have a supporting source, and attach an inline Markdown link for each factual statement that cites external evidence.',
    'When details are missing, respond with the exact string "UNKNOWN" rather than inventing data.'
  ].join(' ')
}

function buildUserPrompt(paper: PaperSummary): string {
  const paperLines = [
    `Title: ${paper.title}`,
    paper.authors?.length ? `Authors: ${paper.authors.join(', ')}` : 'Authors: UNKNOWN',
    paper.venue ? `Venue: ${paper.venue}${paper.year ? ` (${paper.year})` : ''}` : 'Venue: UNKNOWN',
    paper.abstract ? `Abstract: ${paper.abstract}` : 'Abstract: UNKNOWN',
    paper.scrapedContent ? `Context: ${paper.scrapedContent.slice(0, 4000)}` : 'Context: LIMITED'
  ]

  return `Analyse the following paper for reproducibility requirements and risks.

${paperLines.join('\n')}

Return a JSON object that mirrors the provided schema. Each section should:
- List tangible artefacts (datasets, models, code repositories, bill of materials) with inline markdown links if available.
- Specify environment expectations (hardware, software, tooling) and note any licensing or access constraints.
- Summarise hyperparameters, control seeds, and configuration deltas; standardise version numbers and metric changes.
- Capture replication evidence, open risks, and gaps with confidence/severity labels.
- Produce a minimal step-by-step reproduction plan (4-6 ordered actions) tailored for a capable lab.

Rules:
1. Use Australian English in every response string.
2. Avoid null; use "UNKNOWN" or omit empty optional sections.
3. Every factual claim must include an inline markdown source link, eg "Dataset available on [Zenodo](https://zenodo.org/...)".
4. If the API evidence is limited or rate-limited, explain the constraint in the notes field.
`
}

function logOutcome(paperId: string, payload: VerifyReproducibilityPayload) {
  console.log('[reproducibility]', {
    paperId,
    assessment: payload.assessment,
    durationMs: payload.metadata.durationMs,
    citationCount: payload.metadata.citationCount,
    status: payload.metadata.status
  })
}
