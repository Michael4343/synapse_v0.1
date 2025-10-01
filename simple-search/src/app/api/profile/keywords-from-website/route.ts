import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/website-scraper'

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

  // Build focused prompt for academic website analysis
  const systemPrompt = `You are an expert at extracting precise academic keywords from researcher profile pages. You understand field-specific terminology and prioritize searchable, specific terms that would help find relevant research papers.`

  const userPrompt = `Extract 5-8 precise academic keywords from this researcher's profile page for use in research paper search.

ANALYSIS STEPS:
1. Identify the researcher's primary field(s) and subfields
2. Note key research areas, methodologies, and techniques mentioned
3. Identify specific topics, applications, and technologies
4. Look for research interests, publication topics, and project descriptions
5. Extract technical terms that researchers actually search for

QUALITY RULES:
✅ Use field-specific technical terminology
✅ Be specific: "computational neuroscience" not just "neuroscience"
✅ Include methodologies: "machine learning", "clinical trials", "CRISPR gene editing"
✅ Multi-word phrases when more specific: "natural language processing"
✅ Keywords should be 1-4 words, searchable in academic databases

❌ Avoid generic terms: "research", "teaching", "publications", "contact", "cv", "bio"
❌ Avoid institutional terms: "department", "university", "professor", "faculty"
❌ Avoid personal info: names, emails, addresses
❌ Avoid navigation terms: "home", "about", "publications", "news"

WEBSITE CONTENT:
${title ? `Page title: ${title}\n\n` : ''}${text.substring(0, 10000)}

Extract the most distinctive and searchable academic keywords. Respond with JSON only following this format:
{
  "keywords": ["keyword1", "keyword2", ...],
  "primary_field": "Primary research field identified",
  "reasoning": "Brief explanation of keyword selection"
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
                  description: 'Array of specific, searchable academic keywords'
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

    return result.keywords.slice(0, 8)

  } catch (error) {
    console.error('LLM keyword extraction failed:', error)
    return extractKeywordsFallback(text)
  }
}

/**
 * Fallback keyword extraction using frequency analysis
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
  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword]) => keyword)
    .filter(keyword => !commonWords.includes(keyword))
    .slice(0, 5)
}

export async function POST(request: NextRequest) {
  try {
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
