// No SDK import needed — we call the OpenAI-compatible Gemini endpoint directly.

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

  // Trim + normalize paper payload
  const trimmed = papers.slice(0, 12).map((p, i) => ({
    idx: i + 1,
    title: p.title,
    abstract: (p.abstract ?? '').slice(0, 800),
    venue: p.venue ?? undefined,
    citations: p.citationCount ?? undefined,
  }))

  // Strong schema so we always get the fields your UI expects
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Reuse the model family that already works in your profile code
        model: process.env.DIGEST_MODEL || 'gemini-2.5-flash',
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'weekly_research_digest',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                must_read: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      idx: { type: 'integer' },
                      why_critical: { type: 'string' },
                      connection: { type: 'string' },
                    },
                    required: ['idx', 'why_critical', 'connection'],
                  },
                  maxItems: 6,
                },
                worth_reading: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      idx: { type: 'integer' },
                      note: { type: 'string' },
                    },
                    required: ['idx', 'note'],
                  },
                  maxItems: 10,
                },
              },
              required: ['summary', 'must_read', 'worth_reading'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'You are an expert research curator. Produce crisp, useful insights, not generic filler. Tailor strictly to the user profile.',
          },
          {
            role: 'user',
            content:
              [
                `User profile: ${JSON.stringify(profileDescription)}`,
                'Papers (idx, title, abstract<=800, venue, citations):',
                JSON.stringify(trimmed),
                '',
                'Instructions:',
                '- Write a short narrative summary tying the papers to the profile.',
                '- Choose up to 6 must_read items with: why_critical (1–2 sentences) and connection (how it ties to the profile).',
                '- Put the rest (or none) in worth_reading with a brief note.',
                '- Return ONLY JSON matching the provided schema.',
              ].join('\n'),
          },
        ],
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini digest request failed: ${response.status} ${err}`)
  }

  const payload = await response.json()
  let content = payload?.choices?.[0]?.message?.content

  // Some responses may already be objects; others are JSON strings (or fenced).
  if (typeof content === 'string') {
    content = content.replace(/```json|```/gi, '').trim()
  } else if (content && typeof content !== 'string') {
    // Convert object -> string for uniform parsing path
    content = JSON.stringify(content)
  } else {
    content = ''
  }

  try {
    const parsed = JSON.parse(content)

    // Light normalization to guarantee the shape your UI expects
    const digest: GeminiDigest = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      must_read: Array.isArray(parsed.must_read)
        ? parsed.must_read
            .filter((x: any) => Number.isFinite(x?.idx))
            .map((x: any) => ({
              idx: Number(x.idx),
              why_critical: String(x.why_critical ?? ''),
              connection: String(x.connection ?? ''),
            }))
        : [],
      worth_reading: Array.isArray(parsed.worth_reading)
        ? parsed.worth_reading
            .filter((x: any) => Number.isFinite(x?.idx))
            .map((x: any) => ({
              idx: Number(x.idx),
              note: String(x.note ?? ''),
            }))
        : [],
    }

    // If model returned empty arrays, keep UX-friendly fallback summary
    if (!digest.summary || (digest.must_read.length === 0 && digest.worth_reading.length === 0)) {
      return fallbackDigest()
    }

    return digest
  } catch {
    return fallbackDigest()
  }
}

function fallbackDigest(): GeminiDigest {
  return {
    summary:
      'Here are this week’s most relevant papers for your interests. I couldn’t generate a tailored narrative right now, but the list is filtered to match your profile.',
    must_read: [],
    worth_reading: [],
  }
}

export type { GeminiDigest }
