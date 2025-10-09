import { GoogleGenerativeAI } from '@google/generative-ai'

type Paper = {
  title: string
  abstract?: string | null
  venue?: string | null
  citationCount?: number | null
}

interface GeminiDigest {
  summary: string
  must_read: Array<{ idx: number; why_critical: string; connection: string }>
  worth_reading: Array<{ idx: number; note: string }>
}

export async function generateDigestWithGemini(
  profileDescription: string,
  papers: Paper[]
): Promise<GeminiDigest> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const trimmed = papers.slice(0, 12).map((paper, index) => ({
    idx: index + 1,
    title: paper.title,
    abstract: (paper.abstract ?? '').slice(0, 700),
    venue: paper.venue ?? undefined,
    citations: paper.citationCount ?? undefined,
  }))

  const prompt = [
    'You generate a weekly research digest for a scientist.',
    `User profile description: "${profileDescription}".`,
    'You will receive up to 12 papers with title, abstract (<=700 chars), venue, citations.',
    'Return VALID JSON ONLY (no markdown fences). Shape:',
    '{"summary": string (<=180 words, address the user as "you"),',
    '"must_read":[{"idx": number, "why_critical": string, "connection": string}],',
    '"worth_reading":[{"idx": number, "note": string}]}',
    '',
    'PAPERS:',
    JSON.stringify(trimmed),
  ].join('\n')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
  const response = await model.generateContent(prompt)
  const text = response.response.text().trim()

  try {
    return JSON.parse(text)
  } catch {
    return {
      summary:
        'Here are this week’s most relevant papers for your interests. I couldn’t generate a tailored narrative, but the selected items are filtered to match your profile. You can still scan the list below and mark what’s relevant to improve future digests.',
      must_read: [],
      worth_reading: [],
    }
  }
}

export type { GeminiDigest }

