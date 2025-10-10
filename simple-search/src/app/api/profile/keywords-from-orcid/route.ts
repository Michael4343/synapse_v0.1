import { NextRequest, NextResponse } from 'next/server'
import { fetchOrcidWorks } from '@/lib/profile-enrichment'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

interface RequestBody {
  orcidId: string
}

interface OrcidWork {
  title?: string
  abstract?: string
  journal?: string
  year?: number
  contributors?: string[]
}

interface KeywordExtractionResult {
  keywords: string[]
  primary_field?: string
  reasoning?: string
}

const DEFAULT_MODEL = process.env.PROFILE_ENRICHMENT_MODEL || 'gemini-2.5-flash'

/**
 * Extract keywords using Gemini LLM with focused prompt and few-shot examples
 */
async function extractKeywordsWithLLM(works: OrcidWork[]): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.log('GEMINI_API_KEY not configured, using fallback')
    return extractKeywordsFallback(works)
  }

  // Prepare works summary with recency weighting
  const currentYear = new Date().getFullYear()
  const worksSummary = works.slice(0, 30).map((work, index) => {
    const yearsAgo = work.year ? currentYear - work.year : 999
    const recencyWeight = yearsAgo <= 3 ? 'RECENT' : yearsAgo <= 7 ? 'MEDIUM' : 'OLD'

    return {
      title: work.title || 'Untitled',
      journal: work.journal,
      year: work.year,
      recency: recencyWeight,
    }
  })

  // Build focused prompt without examples to avoid bias
  const systemPrompt = `You are an expert at creating field-focused academic search queries from publication histories. Your goal is to identify the researcher's field and generate search terms that capture their research area without being overly specific to individual molecules, proteins, or compounds.`

  const userPrompt = `Generate 5-8 field-focused search queries from these publications for discovering relevant academic papers.

ANALYSIS STEPS:
1. Identify the primary research field(s) and subfields
2. Note general methodologies, techniques, and approaches
3. Identify application domains and broad problem areas
4. Weight RECENT publications 2x more heavily than older ones
5. Combine concepts into realistic search strings

QUALITY RULES - FIELD-LEVEL QUERIES:
✅ Combine 2-4 words focusing on field-level concepts
✅ Mix general methodology + application area
✅ Mix broad technique + domain
✅ Mix biological/scientific processes + field
✅ Capture the research FIELD not specific entities
✅ Focus on processes, mechanisms, and general approaches

❌ AVOID single-word queries - too generic
❌ AVOID specific protein/gene/molecule names - too narrow
❌ AVOID specific compound names or receptor subtypes - too specific
❌ AVOID model organism names alone - need context
❌ Avoid generic academic terms like "research", "study", "novel", "improved"
❌ Don't use verb phrases like "studying the effects of"
❌ Focus on GENERAL PROCESSES and FIELD-LEVEL concepts, not molecular entities

ANALYZE THESE PUBLICATIONS:

${JSON.stringify(worksSummary, null, 2)}

Total publications: ${works.length}
Recent publications (last 3 years): ${worksSummary.filter(w => w.recency === 'RECENT').length}

Respond with JSON only following the format above. Generate distinctive multi-word search queries that combine concepts.`

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.3, // Low temperature for consistent, focused extraction
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'keyword_extraction',
            schema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 5,
                  maxItems: 8,
                  description: 'Array of 2-4 word field-focused search queries combining general concepts and processes'
                },
                primary_field: {
                  type: 'string',
                  description: 'Primary research field identified'
                },
                reasoning: {
                  type: 'string',
                  description: 'Brief explanation of keyword selection and field identification'
                }
              },
              required: ['keywords']
            }
          }
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', response.status, errorText)
      return extractKeywordsFallback(works)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content

    if (!content) {
      console.error('No content in Gemini response')
      return extractKeywordsFallback(works)
    }

    const result: KeywordExtractionResult = JSON.parse(content)

    if (!Array.isArray(result.keywords) || result.keywords.length === 0) {
      console.error('Invalid keywords in Gemini response')
      return extractKeywordsFallback(works)
    }

    // Log reasoning for debugging (optional)
    if (result.reasoning) {
      console.log('Keyword extraction reasoning:', result.reasoning)
    }

    // Filter out single-word queries (enforce 2+ words)
    const filteredKeywords = result.keywords.filter(keyword => {
      const wordCount = keyword.trim().split(/\s+/).length
      return wordCount >= 2
    })

    if (filteredKeywords.length === 0) {
      console.error('All LLM keywords were too generic (< 2 words)')
      return extractKeywordsFallback(works)
    }

    return filteredKeywords.slice(0, 8) // Ensure max 8 keywords

  } catch (error) {
    console.error('LLM keyword extraction failed:', error)
    return extractKeywordsFallback(works)
  }
}

/**
 * Fallback extraction using improved frequency analysis to generate multi-word queries
 */
function extractKeywordsFallback(works: OrcidWork[]): string[] {
  const keywordCounts = new Map<string, number>()
  const currentYear = new Date().getFullYear()

  for (const work of works) {
    // Weight recent publications more heavily
    const yearsAgo = work.year ? currentYear - work.year : 999
    const weight = yearsAgo <= 3 ? 3 : yearsAgo <= 7 ? 2 : 1

    const text = [work.title, work.journal].filter(Boolean).join(' ')
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9#+-]+/)
      .filter((token) => token.length > 3 && token.length < 30)

    for (const token of tokens) {
      keywordCounts.set(token, (keywordCounts.get(token) ?? 0) + weight)
    }
  }

  // Enhanced common words filter
  const commonWords = [
    'research', 'study', 'analysis', 'using', 'based', 'approach', 'method',
    'results', 'data', 'paper', 'article', 'journal', 'conference', 'proceedings',
    'novel', 'efficient', 'improved', 'enhanced', 'advanced', 'comprehensive',
    'investigation', 'evaluation', 'assessment', 'review', 'survey', 'overview',
    'application', 'applications', 'applied', 'theory', 'theoretical', 'practical',
    'international', 'national', 'annual', 'workshop', 'symposium'
  ]

  // Get top keywords
  const topKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword]) => keyword)
    .filter(keyword => !commonWords.includes(keyword))
    .slice(0, 10)

  // Generate multi-word combinations
  const queries: string[] = []

  // Create 2-3 word combinations from top keywords
  for (let i = 0; i < Math.min(topKeywords.length, 5); i++) {
    const parts: string[] = [topKeywords[i]]

    // Add 1-2 more related keywords
    for (let j = i + 1; j < Math.min(topKeywords.length, i + 3) && parts.length < 3; j++) {
      parts.push(topKeywords[j])
    }

    if (parts.length >= 2) {
      queries.push(parts.join(' '))
    }
  }

  return queries.length > 0 ? queries : topKeywords.slice(0, 5)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: RequestBody = await request.json()
    const { orcidId } = body

    if (!orcidId || typeof orcidId !== 'string') {
      return NextResponse.json({ error: 'ORCID ID is required' }, { status: 400 })
    }

    const rateKey = `profile-orcid:${user.id}`
    const rateResult = checkRateLimit(rateKey, 5 * 60 * 1000, 5)

    if (!rateResult.allowed) {
      const retrySeconds = rateResult.retryAfterMs ? Math.ceil(rateResult.retryAfterMs / 1000) : 60
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retrySeconds)
          }
        }
      )
    }

    // Fetch ORCID works
    const orcidResult = await fetchOrcidWorks(orcidId)

    if (orcidResult.error) {
      return NextResponse.json({
        error: orcidResult.error
      }, { status: 400 })
    }

    if (orcidResult.works.length === 0) {
      return NextResponse.json({
        error: 'No publications found for this ORCID ID. Make sure your ORCID profile is public and contains publication data.'
      }, { status: 400 })
    }

    // Extract keywords using LLM (with fallback to frequency analysis)
    const keywords = await extractKeywordsWithLLM(orcidResult.works)

    return NextResponse.json({
      keywords,
      worksCount: orcidResult.works.length,
      message: keywords.length > 0
        ? `Generated ${keywords.length} keywords from ${orcidResult.works.length} publications using AI analysis`
        : 'No meaningful keywords could be extracted'
    })

  } catch (error) {
    console.error('Keywords from ORCID error:', error)
    return NextResponse.json(
      { error: 'Failed to generate keywords from ORCID' },
      { status: 500 }
    )
  }
}
