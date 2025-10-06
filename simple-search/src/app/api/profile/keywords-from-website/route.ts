import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/website-scraper'
import { createClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'

interface RequestBody {
  websiteUrl: string
}

interface KeywordExtractionResult {
  keywords: string[]
  primary_field?: string
  reasoning?: string
}

const DEFAULT_MODEL = process.env.PROFILE_ENRICHMENT_MODEL || 'gemini-2.5-flash'

/**
 * Extract keywords from website text using Gemini LLM
 */
async function extractKeywordsFromWebsite(text: string, title?: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.log('GEMINI_API_KEY not configured, using fallback')
    return extractKeywordsFallback(text)
  }

  // Build focused prompt for academic website analysis - conceptual guidance only
  const systemPrompt = `You are an expert at creating field-focused academic search queries from researcher profile pages. Your goal is to identify the researcher's field and generate search terms that capture their research area without being overly specific to individual molecules, proteins, or compounds.`

  const userPrompt = `Generate 5-8 field-focused search queries from this researcher's profile page for discovering relevant academic papers.

ANALYSIS STEPS:
1. Identify the researcher's primary field(s) and subfields
2. Note general research areas, methodologies, and approaches mentioned
3. Identify broad topics, application domains, and general techniques
4. Look for research interests, publication topics, and project descriptions
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
❌ Avoid generic academic terms like "research", "teaching", "publications", "novel", "improved"
❌ Avoid institutional terms like "department", "university", "professor", "faculty"
❌ Don't use verb phrases like "studying the effects of"
❌ Focus on GENERAL PROCESSES and FIELD-LEVEL concepts, not molecular entities

WEBSITE CONTENT:
${title ? `Page title: ${title}\n\n` : ''}${text.substring(0, 10000)}

Generate distinctive multi-word search queries that combine concepts from this researcher's work. Respond with JSON only following this format:
{
  "keywords": ["query1", "query2", ...],
  "primary_field": "Primary research field identified",
  "reasoning": "Brief explanation of query generation"
}`

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.3,
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
      return extractKeywordsFallback(text)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content

    if (!content) {
      console.error('No content in Gemini response')
      return extractKeywordsFallback(text)
    }

    const result: KeywordExtractionResult = JSON.parse(content)

    if (!Array.isArray(result.keywords) || result.keywords.length === 0) {
      console.error('Invalid keywords in Gemini response')
      return extractKeywordsFallback(text)
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
      return extractKeywordsFallback(text)
    }

    return filteredKeywords.slice(0, 8)

  } catch (error) {
    console.error('LLM keyword extraction failed:', error)
    return extractKeywordsFallback(text)
  }
}

/**
 * Fallback keyword extraction using frequency analysis to generate multi-word queries
 */
function extractKeywordsFallback(text: string): string[] {
  const keywordCounts = new Map<string, number>()

  // Split into words and filter
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9#+-]+/)
    .filter((token) => token.length > 3 && token.length < 30)

  // Count frequencies
  for (const token of tokens) {
    keywordCounts.set(token, (keywordCounts.get(token) ?? 0) + 1)
  }

  // Common words to filter out
  const commonWords = [
    'about', 'research', 'university', 'professor', 'department', 'publications',
    'contact', 'email', 'page', 'home', 'website', 'profile', 'faculty',
    'education', 'experience', 'teaching', 'curriculum', 'vitae', 'interests',
    'work', 'study', 'include', 'such', 'more', 'many', 'some', 'other',
    'also', 'been', 'have', 'this', 'that', 'with', 'from', 'their',
    'would', 'could', 'should', 'these', 'those', 'there', 'where', 'when'
  ]

  // Get top keywords excluding common words
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
    const { websiteUrl } = body

    if (!websiteUrl || typeof websiteUrl !== 'string') {
      return NextResponse.json({ error: 'Website URL is required' }, { status: 400 })
    }

    // Validate URL format
    if (!websiteUrl.match(/^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/.*)?$/i)) {
      return NextResponse.json({
        error: 'Invalid URL format. Please enter a valid website URL.'
      }, { status: 400 })
    }

    const rateKey = `profile-website:${user.id}`
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

    // Scrape the website
    const scrapeResult = await scrapeWebsite(websiteUrl)

    if (scrapeResult.error || !scrapeResult.text) {
      return NextResponse.json({
        error: scrapeResult.error || 'Failed to extract content from website'
      }, { status: 400 })
    }

    // Extract keywords using LLM
    const keywords = await extractKeywordsFromWebsite(scrapeResult.text, scrapeResult.title)

    if (keywords.length === 0) {
      return NextResponse.json({
        error: 'No meaningful keywords could be extracted from the website. Please try a different academic profile page.'
      }, { status: 400 })
    }

    return NextResponse.json({
      keywords,
      message: `Generated ${keywords.length} keywords from your academic website using AI analysis`
    })

  } catch (error) {
    console.error('Keywords from website error:', error)
    return NextResponse.json(
      { error: 'Failed to generate keywords from website' },
      { status: 500 }
    )
  }
}
