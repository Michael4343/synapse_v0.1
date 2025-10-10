// simple-search/src/lib/llm/gemini.ts

type Paper = {
  title: string
  abstract?: string | null
  venue?: string | null
  citationCount?: number | null
}

export interface GeminiDigest {
  summary: string
  must_read: Array<{ idx: number; why: string }>
  worth_reading: Array<{ idx: number; note: string }>
}

export async function generateDigestWithGemini(
  profileDescription: string,
  papers: Paper[]
): Promise<GeminiDigest> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  // Allow switching model via env; default to PRO if you want stronger summaries.
  // Examples:
  //   GEMINI_DIGEST_MODEL=gemini-2.0-pro-exp-02-05
  //   GEMINI_DIGEST_MODEL=gemini-2.0-flash
  const modelId =
    process.env.GEMINI_DIGEST_MODEL ||
    process.env.PROFILE_ENRICHMENT_MODEL || // fallback if you already set this elsewhere
    'gemini-2.0-pro-exp-02-05'

  const trimmed = papers.slice(0, 12).map((p, i) => ({
    idx: i + 1,
    title: p.title,
    abstract: (p.abstract ?? '').slice(0, 700),
    venue: p.venue ?? undefined,
    citations: p.citationCount ?? undefined,
  }))

  // --- Upgraded prompt: clearer tasks + “This week in research …” tone ---
  const system =
    'You generate a weekly research digest for a busy scientist. ' +
    'Be concise, specific, and helpful. Use plain language. Return ONLY JSON (no prose outside JSON).'

  const user = [
    `User profile description: "${profileDescription}".`,
    'You will receive up to 12 papers with title, abstract (<=700 chars), venue, and citations.',

    'TASK 1 – GLOBAL NARRATIVE:',
    "- Write 3–5 sentences starting with 'This week in research…'.",
    '- Identify main new developments, themes, or surprising results across the set.',
    "- Explain why these developments matter for the user's stated interests.",
    '- Sound like a thoughtful colleague, not boilerplate.',

    'TASK 2 – MUST-READ PAPERS:',
    '- Select 2–4 papers that are most critical for the user.',
    "- For each, write a short human explanation: 'Here’s why you should read this…' (1–2 sentences).",
    '- Focus on novelty, significance, or direct relevance.',

    'TASK 3 – WORTH-READING PAPERS:',
    '- For remaining relevant papers, add a short 1–2 sentence note as guidance/advice.',
    "- e.g., 'Useful background if you’re tracking X…'",

    'OUTPUT: JSON ONLY (no markdown fences, no commentary).',
    'Schema:',
    '{"summary": string, "must_read":[{"idx": number, "why": string}], "worth_reading":[{"idx": number, "note": string}]}',
    '',
    'PAPERS:',
    JSON.stringify(trimmed),
  ].join('\n')

  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',   // 🔑 force Flash for now
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    }
  )

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Gemini digest request failed: ${resp.status} ${body}`)
  }

  const json = await resp.json()
  const text: string =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
    ''

  const clean = String(text).replace(/```json|```/gi, '').trim()

  try {
    const parsed = JSON.parse(clean)
    // Minimal shape guard
    if (!parsed || typeof parsed !== 'object') throw new Error('bad shape')
    parsed.must_read ||= []
    parsed.worth_reading ||= []
    return parsed as GeminiDigest
  } catch {
    // Soft fallback; UI will still render a digest using non-LLM blurbs.
    return {
      summary:
        "Here are this week’s most relevant papers for your interests. I couldn’t generate a tailored narrative right now, but the list is filtered to your stated interests.",
      must_read: [],
      worth_reading: [],
    }
  }
}
