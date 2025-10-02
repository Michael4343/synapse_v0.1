interface DeepResearchParams {
  apiKey: string
  systemPrompt: string
  userPrompt: string
  responseSchema: Record<string, unknown>
  timeoutMs?: number
  maxRetries?: number
}

interface DeepResearchSuccess {
  ok: true
  parsed: unknown
  raw: string
  citations: Citation[]
  durationMs: number
  retryCount: number
}

interface DeepResearchFailure {
  ok: false
  error: string
  status?: number
  durationMs: number
  retryCount: number
}

export interface Citation {
  id?: string
  title?: string
  url?: string
  snippet?: string
}

export type DeepResearchResult = DeepResearchSuccess | DeepResearchFailure

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions'
const DEFAULT_TIMEOUT_MS = 25_000
const DEFAULT_MAX_RETRIES = 2

export async function runPerplexityDeepResearch(params: DeepResearchParams): Promise<DeepResearchResult> {
  const { apiKey, systemPrompt, userPrompt, responseSchema, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_MAX_RETRIES } = params

  const sanitizedRetries = Math.max(0, Math.min(maxRetries, 4))

  for (let attempt = 0; attempt <= sanitizedRetries; attempt++) {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = Date.now()

    try {
      const body = JSON.stringify({
        model: 'sonar-deep-research',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        response_format: responseSchema
      })

      const response = await fetch(PERPLEXITY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body,
        signal: controller.signal
      })

      const durationMs = Date.now() - startedAt

      if (!response.ok) {
        const errorText = await safeReadText(response)
        if (shouldRetry(response.status, attempt, sanitizedRetries)) {
          await delay(exponentialBackoff(attempt))
          continue
        }
        return {
          ok: false,
          error: errorText || `Perplexity request failed with status ${response.status}`,
          status: response.status,
          durationMs,
          retryCount: attempt
        }
      }

      const payload = await response.json()
      const message = payload?.choices?.[0]?.message
      const rawContent = typeof message?.content === 'string' ? message.content : ''
      const parsed = tryParseContent(rawContent)
      const citations = extractCitations(payload)

      if (!parsed) {
        return {
          ok: false,
          error: 'Perplexity response could not be parsed as JSON',
          status: response.status,
          durationMs,
          retryCount: attempt
        }
      }

      return {
        ok: true,
        parsed,
        raw: rawContent,
        citations,
        durationMs,
        retryCount: attempt
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message === 'The user aborted a request.' || message === 'The operation was aborted.' || message.includes('aborted')) {
        if (attempt < sanitizedRetries) {
          await delay(exponentialBackoff(attempt))
          continue
        }
        return {
          ok: false,
          error: 'Perplexity request timed out',
          durationMs,
          retryCount: attempt
        }
      }

      if (attempt < sanitizedRetries) {
        await delay(exponentialBackoff(attempt))
        continue
      }

      return {
        ok: false,
        error: message,
        durationMs,
        retryCount: attempt
      }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  return {
    ok: false,
    error: 'Perplexity request failed after retries',
    durationMs: 0,
    retryCount: DEFAULT_MAX_RETRIES
  }
}

function shouldRetry(status: number, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) {
    return false
  }
  return status === 429 || status === 408 || status >= 500
}

function exponentialBackoff(attempt: number): number {
  const base = 500
  return base * Math.pow(2, attempt)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tryParseContent(content: string): unknown {
  if (!content) {
    return null
  }

  const direct = safeJsonParse(content)
  if (direct) {
    return direct
  }

  const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i)
  if (fencedMatch) {
    return safeJsonParse(fencedMatch[1])
  }

  return null
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function extractCitations(payload: any): Citation[] {
  const raw = payload?.choices?.[0]?.message?.citations
    || payload?.choices?.[0]?.citations
    || payload?.citations
    || []

  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((entry: any) => ({
    id: typeof entry?.id === 'string' ? entry.id : undefined,
    title: typeof entry?.title === 'string' ? entry.title : undefined,
    url: typeof entry?.url === 'string' ? entry.url : undefined,
    snippet: typeof entry?.snippet === 'string' ? entry.snippet : undefined
  }))
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    return ''
  }
}
