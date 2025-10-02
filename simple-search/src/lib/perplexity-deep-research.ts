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

export interface DeepResearchFailure {
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
      const rawContent = extractMessageContent(payload)
      const parsed = tryParseContent(rawContent)
      const citations = extractCitations(payload)

      if (!parsed) {
        const truncated = rawContent ? rawContent.slice(0, 800) : ''
        return {
          ok: false,
          error: truncated
            ? `Perplexity response could not be parsed as JSON. Sample: ${truncated}`
            : 'Perplexity response could not be parsed as JSON',
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

  const cleaned = stripReasoningBlocks(content)
  const unwrapped = unwrapCodeFence(cleaned)

  const direct = safeJsonParse(unwrapped)
  if (direct) {
    return direct
  }

  const fallback = safeJsonParse(cleaned)
  if (fallback) {
    return fallback
  }

  const inlineJson = extractInlineJson(cleaned)
  if (inlineJson) {
    return safeJsonParse(inlineJson)
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

function extractMessageContent(payload: any): string {
  const choice = payload?.choices?.[0] ?? payload?.output?.[0]
  const messageContent = choice?.message?.content ?? choice?.content

  if (typeof messageContent === 'string') {
    return messageContent
  }

  if (Array.isArray(messageContent)) {
    const joined = messageContent
      .map((segment) => {
        if (typeof segment === 'string') {
          return segment
        }
        if (segment && typeof segment.text === 'string') {
          return segment.text
        }
        if (segment && typeof segment.content === 'string') {
          return segment.content
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
    if (joined) {
      return joined
    }
  }

  const outputText = choice?.message?.output_text || choice?.output_text || payload?.output_text
  if (Array.isArray(outputText)) {
    const joined = outputText
      .map((segment: unknown) => (typeof segment === 'string' ? segment : ''))
      .filter(Boolean)
      .join('\n')
    if (joined) {
      return joined
    }
  }

  if (typeof outputText === 'string') {
    return outputText
  }

  return ''
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

function extractInlineJson(content: string): string | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  const candidate = content.slice(start, end + 1).trim()
  const balanced = isProbablyBalancedJson(candidate)
  return balanced ? candidate : null
}

function isProbablyBalancedJson(content: string): boolean {
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{' || char === '[') {
      depth += 1
    } else if (char === '}' || char === ']') {
      depth -= 1
      if (depth < 0) {
        return false
      }
    }
  }

  return depth === 0 && !inString
}
