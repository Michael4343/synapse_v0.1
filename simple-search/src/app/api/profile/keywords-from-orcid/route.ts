import { NextRequest, NextResponse } from 'next/server'
import { fetchOrcidWorks } from '@/lib/profile-enrichment'

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

  // Build focused prompt with few-shot examples
  const systemPrompt = `You are an expert at extracting precise technical keywords from academic publication histories. You understand field-specific terminology and prioritize searchable, specific terms over generic academic language.`

  const userPrompt = `Extract 5-8 precise academic keywords from these publications for use in research paper search.

ANALYSIS STEPS:
1. Identify the primary research field(s) and subfields
2. Note key methodologies, techniques, and technologies used
3. Identify application domains and specific problem areas
4. Weight RECENT publications 2x more heavily than older ones
5. Extract technical terms that researchers actually search for

QUALITY RULES:
✅ Use field-specific technical terminology
✅ Be specific: "graph neural networks" not just "neural networks"
✅ Include methodologies: "meta-learning", "randomized controlled trials"
✅ Multi-word phrases when more specific: "CRISPR-Cas9 gene editing"
✅ Keywords should be 1-4 words, searchable in academic databases

❌ Avoid generic terms: "research", "analysis", "study", "approach", "method", "novel", "efficient", "improved"
❌ Avoid field names alone: "biology", "computer science" (too broad)
❌ Avoid verb phrases: "studying the effects of", "analyzing data from"

FEW-SHOT EXAMPLES:

Example 1 - Machine Learning Researcher:
Publications (RECENT):
- "Constitutional AI: Harmlessness from AI Feedback" (2024)
- "Training Language Models with RLHF" (2023)
- "Scaling Laws for Reward Models" (2023)
Publications (OLD):
- "Deep Reinforcement Learning for Robotics" (2019)

Output: {
  "keywords": [
    "reinforcement learning from human feedback",
    "AI alignment",
    "constitutional AI",
    "reward modeling",
    "large language models"
  ],
  "primary_field": "AI Safety & Machine Learning",
  "reasoning": "Researcher has pivoted from robotics RL to AI safety. Recent work focuses on RLHF and alignment techniques. Weighted recent publications (2023-2024) heavily."
}

Example 2 - Computational Biology Researcher:
Publications (RECENT):
- "AlphaFold-Multimer for Protein Complex Prediction" (2024)
- "Deep Learning for Protein Structure Prediction" (2023)
Publications (MEDIUM):
- "Molecular Dynamics Simulations of Membrane Proteins" (2020)
- "GPCR Binding Site Analysis Using Docking" (2019)

Output: {
  "keywords": [
    "protein structure prediction",
    "AlphaFold",
    "molecular dynamics simulations",
    "GPCR drug targets",
    "protein-ligand docking"
  ],
  "primary_field": "Computational Structural Biology",
  "reasoning": "Focus on computational protein analysis with shift toward deep learning methods. Combined recent AI approaches with established computational biology techniques."
}

NOW ANALYZE THESE PUBLICATIONS:

${JSON.stringify(worksSummary, null, 2)}

Total publications: ${works.length}
Recent publications (last 3 years): ${worksSummary.filter(w => w.recency === 'RECENT').length}

Respond with JSON only following the format above. Focus on extracting the most distinctive and searchable keywords.`

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

    return result.keywords.slice(0, 8) // Ensure max 8 keywords

  } catch (error) {
    console.error('LLM keyword extraction failed:', error)
    return extractKeywordsFallback(works)
  }
}

/**
 * Fallback extraction using improved frequency analysis
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

  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([keyword]) => keyword)
    .filter(keyword => !commonWords.includes(keyword))
    .slice(0, 5)
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()
    const { orcidId } = body

    if (!orcidId || typeof orcidId !== 'string') {
      return NextResponse.json({ error: 'ORCID ID is required' }, { status: 400 })
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