const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions'

interface PerplexityPaperCandidate {
  title: string
  url?: string
  doi?: string
  publicationDate?: string
  summary?: string
}

interface PerplexityResponsePayload {
  papers?: Array<{
    title?: string
    primaryUrl?: string
    doi?: string
    summary?: string
    publicationDate?: string
  }>
}

const MAX_PAPERS = 5

function buildSystemPrompt(): string {
  return [
    'You are an assistant that discovers very recent peer reviewed or preprint research.',
    'Return structured JSON only. Never include markdown or free-form explanations.',
    'Only include works published within the past 24 hours that clearly match the provided research focus.',
    'Prefer canonical links (publisher, arXiv, or DOI resolver).',
  ].join(' ')
}

function buildResponseFormatSchema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'daily_research_digest',
      schema: {
        type: 'object',
        required: ['papers'],
        properties: {
          papers: {
            type: 'array',
            maxItems: MAX_PAPERS,
            items: {
              type: 'object',
              required: ['title', 'primaryUrl'],
              properties: {
                title: { type: 'string' },
                primaryUrl: { type: 'string' },
                doi: { type: 'string' },
                summary: { type: 'string' },
                publicationDate: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  }
}

function buildUserPrompt(keywords: string[]): string {
  const focusList = keywords.map((keyword) => `- ${keyword}`).join('\n')

  return [
    'Research interests:',
    focusList,
    '',
    'Find up to five new papers published in the last 24 hours that align with these interests.',
    'Provide concise summaries focused on why the paper matters to the research area.',
    'Output JSON matching the provided schema.',
  ].join('\n')
}

function stripReasoningBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

function unwrapCodeFence(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim()
  }

  return trimmed
}

function normaliseUrl(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    return url.toString()
  } catch (error) {
    return value.trim()
  }
}

export async function fetchPerplexityRecentPapers(keywords: string[]): Promise<PerplexityPaperCandidate[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY

  if (!apiKey || !keywords.length) {
    return []
  }

  const response = await fetch(PERPLEXITY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'sonar-deep-research',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(keywords) },
      ],
      response_format: buildResponseFormatSchema(),
      temperature: 0,
    }),
  })

  if (!response.ok) {
    console.error('Perplexity daily digest fetch failed', response.status, await response.text())
    return []
  }

  const payload = await response.json().catch((error) => {
    console.error('Failed parsing Perplexity response body', error)
    return null
  })

  const rawContent = payload?.choices?.[0]?.message?.content

  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return []
  }

  const cleanedContent = unwrapCodeFence(stripReasoningBlocks(rawContent))

  let structured: PerplexityResponsePayload | null = null

  try {
    structured = JSON.parse(cleanedContent)
  } catch (error) {
    console.error('Perplexity response JSON parse error', error)
    return []
  }

  if (!Array.isArray(structured?.papers)) {
    return []
  }

  return structured.papers
    .map((paper): PerplexityPaperCandidate => ({
      title: paper.title?.trim() ?? '',
      url: normaliseUrl(paper.primaryUrl),
      doi: paper.doi?.trim(),
      summary: paper.summary?.trim(),
      publicationDate: paper.publicationDate?.trim(),
    }))
    .filter((paper) => Boolean(paper.title && (paper.url || paper.doi)))
}

export type { PerplexityPaperCandidate }
