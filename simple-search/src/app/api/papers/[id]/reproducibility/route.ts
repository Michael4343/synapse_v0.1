import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface ReproducibilityVerdict {
  score: 'easy' | 'moderate' | 'difficult' | 'unknown'
  timeEstimate: string
  costEstimate: string
  skillLevel: string
  summary: string
}

interface ReproducibilityRequirements {
  dataAvailability: 'public' | 'restricted' | 'request' | 'unavailable'
  dataLocation?: string
  codeAvailability: 'public' | 'request' | 'unavailable'
  codeLocation?: string
  equipment: string[]
  expertise: string[]
}

interface ReproducibilityGap {
  severity: 'critical' | 'important' | 'minor'
  description: string
  impact: string
  resolution?: string
}

interface RelatedPaper {
  id: string
  title: string
  relevance: string
}

interface ReproducibilityReport {
  paperId: string
  paperTitle: string
  verdict: ReproducibilityVerdict
  requirements: ReproducibilityRequirements
  gaps: ReproducibilityGap[]
  relatedPapers?: RelatedPaper[]
  generatedAt: string
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
}

const DEFAULT_MODEL = 'gemini-2.0-flash-exp'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { id: paperId } = await context.params

    if (!paperId) {
      return NextResponse.json(
        { error: 'Paper ID is required' },
        { status: 400 }
      )
    }

    // Check if we already have a report for this paper
    const { data: existingReport, error: fetchError } = await supabase
      .from('reproducibility_reports')
      .select('*')
      .eq('paper_id', paperId)
      .single()

    if (existingReport && !fetchError) {
      // Return cached report
      return NextResponse.json({
        cached: true,
        report: existingReport.report_data,
        generatedAt: existingReport.generated_at,
      })
    }

    // Fetch paper details from the papers API
    const paperResponse = await fetch(
      `${request.nextUrl.origin}/api/papers/${paperId}`,
      {
        headers: {
          cookie: request.headers.get('cookie') || '',
        },
      }
    )

    if (!paperResponse.ok) {
      return NextResponse.json(
        { error: 'Paper not found' },
        { status: 404 }
      )
    }

    const paper = await paperResponse.json()

    // Generate new reproducibility report
    const report = await generateReproducibilityReport(paper)

    // Store the report in the database
    const { error: insertError } = await supabase
      .from('reproducibility_reports')
      .insert({
        paper_id: paperId,
        paper_title: paper.title,
        score: report.verdict.score,
        time_estimate: report.verdict.timeEstimate,
        cost_estimate: report.verdict.costEstimate,
        skill_level: report.verdict.skillLevel,
        summary: report.verdict.summary,
        report_data: report,
        confidence: report.confidence,
        sources: report.sources,
      })

    if (insertError) {
      console.error('Failed to store reproducibility report:', insertError)
      // Continue even if storage fails - return the generated report
    }

    return NextResponse.json({
      cached: false,
      report,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Reproducibility report error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate reproducibility report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

async function generateReproducibilityReport(paper: any): Promise<ReproducibilityReport> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    // Return a fallback report if no API key
    return createFallbackReport(paper)
  }

  try {
    // Prepare paper content for analysis
    const sources: string[] = []
    let paperContent = ''

    if (paper.title) {
      paperContent += `Title: ${paper.title}\n\n`
      sources.push('title')
    }

    if (paper.abstract) {
      paperContent += `Abstract: ${paper.abstract}\n\n`
      sources.push('abstract')
    }

    if (paper.authors && paper.authors.length > 0) {
      paperContent += `Authors: ${paper.authors.join(', ')}\n\n`
    }

    if (paper.venue) {
      paperContent += `Published in: ${paper.venue} (${paper.year || 'N/A'})\n\n`
    }

    // Include scraped content if available (truncate to fit in context)
    if (paper.scrapedContent) {
      const truncatedContent = paper.scrapedContent.slice(0, 10000)
      paperContent += `Full Text (excerpt):\n${truncatedContent}\n\n`
      sources.push('full_text')
    }

    // Call Gemini API
    const llmReport = await callGeminiForReproducibility(paperContent, apiKey)

    // Normalize and validate the LLM response
    const report: ReproducibilityReport = {
      paperId: paper.id || paper.semanticScholarId || 'unknown',
      paperTitle: paper.title,
      verdict: {
        score: normalizeScore(llmReport.verdict?.score),
        timeEstimate: llmReport.verdict?.timeEstimate || 'Unknown',
        costEstimate: llmReport.verdict?.costEstimate || 'Unknown',
        skillLevel: llmReport.verdict?.skillLevel || 'Unknown',
        summary: llmReport.verdict?.summary || 'Unable to assess reproducibility.',
      },
      requirements: {
        dataAvailability: normalizeAvailability(llmReport.requirements?.dataAvailability),
        dataLocation: llmReport.requirements?.dataLocation,
        codeAvailability: normalizeCodeAvailability(llmReport.requirements?.codeAvailability),
        codeLocation: llmReport.requirements?.codeLocation,
        equipment: Array.isArray(llmReport.requirements?.equipment) ? llmReport.requirements.equipment : [],
        expertise: Array.isArray(llmReport.requirements?.expertise) ? llmReport.requirements.expertise : [],
      },
      gaps: Array.isArray(llmReport.gaps)
        ? llmReport.gaps.map((gap: any) => ({
            severity: normalizeSeverity(gap.severity),
            description: gap.description || 'Information missing',
            impact: gap.impact || 'Unknown impact',
            resolution: gap.resolution,
          }))
        : [],
      relatedPapers: Array.isArray(llmReport.relatedPapers)
        ? llmReport.relatedPapers.slice(0, 5)
        : undefined,
      generatedAt: new Date().toISOString(),
      confidence: determineConfidence(sources, llmReport),
      sources,
    }

    return report
  } catch (error) {
    console.error('Gemini API call failed:', error)
    return createFallbackReport(paper)
  }
}

async function callGeminiForReproducibility(paperContent: string, apiKey: string): Promise<any> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'reproducibility_assessment',
          schema: {
            type: 'object',
            properties: {
              verdict: {
                type: 'object',
                properties: {
                  score: {
                    type: 'string',
                    enum: ['easy', 'moderate', 'difficult', 'unknown'],
                  },
                  timeEstimate: { type: 'string' },
                  costEstimate: { type: 'string' },
                  skillLevel: { type: 'string' },
                  summary: { type: 'string' },
                },
                required: ['score', 'timeEstimate', 'costEstimate', 'skillLevel', 'summary'],
              },
              requirements: {
                type: 'object',
                properties: {
                  dataAvailability: {
                    type: 'string',
                    enum: ['public', 'restricted', 'request', 'unavailable'],
                  },
                  dataLocation: { type: 'string' },
                  codeAvailability: {
                    type: 'string',
                    enum: ['public', 'request', 'unavailable'],
                  },
                  codeLocation: { type: 'string' },
                  equipment: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  expertise: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['dataAvailability', 'codeAvailability', 'equipment', 'expertise'],
              },
              gaps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    severity: {
                      type: 'string',
                      enum: ['critical', 'important', 'minor'],
                    },
                    description: { type: 'string' },
                    impact: { type: 'string' },
                    resolution: { type: 'string' },
                  },
                  required: ['severity', 'description', 'impact'],
                },
              },
              relatedPapers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    relevance: { type: 'string' },
                  },
                  required: ['title', 'relevance'],
                },
                maxItems: 5,
              },
            },
            required: ['verdict', 'requirements', 'gaps'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: `You are an expert at assessing the reproducibility of scientific research papers. Analyze papers to determine:
1. How easy it would be for another researcher to reproduce the results
2. What resources (data, code, equipment, expertise) are needed
3. What critical information is missing from the paper
4. Time and cost estimates for reproduction

Be practical and specific. Focus on actionable information that helps researchers make go/no-go decisions.`,
        },
        {
          role: 'user',
          content: `Analyze this research paper for reproducibility. Provide a practical assessment that helps researchers decide if they can reproduce this work in their lab.

Paper Content:
${paperContent.slice(0, 15000)}

Respond with a JSON assessment including:
- verdict: Overall difficulty score (easy/moderate/difficult/unknown), time estimate, cost range, skill level required, and a one-sentence summary
- requirements: Data availability, code availability, equipment needed, expertise required
- gaps: Critical information missing from the paper that would hinder reproduction
- relatedPapers: 3-5 papers with similar methods (optional, if you can identify them from context)`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const message = payload?.choices?.[0]?.message?.content

  if (!message) {
    throw new Error('Gemini response missing content')
  }

  return JSON.parse(message)
}

function createFallbackReport(paper: any): ReproducibilityReport {
  return {
    paperId: paper.id || paper.semanticScholarId || 'unknown',
    paperTitle: paper.title,
    verdict: {
      score: 'unknown',
      timeEstimate: 'Unable to estimate',
      costEstimate: 'Unable to estimate',
      skillLevel: 'Unknown',
      summary: 'Reproducibility assessment unavailable. Please check back later.',
    },
    requirements: {
      dataAvailability: 'unavailable',
      codeAvailability: 'unavailable',
      equipment: [],
      expertise: [],
    },
    gaps: [
      {
        severity: 'critical',
        description: 'AI analysis unavailable',
        impact: 'Cannot assess reproducibility automatically',
        resolution: 'Manual review required',
      },
    ],
    generatedAt: new Date().toISOString(),
    confidence: 'low',
    sources: ['fallback'],
  }
}

function normalizeScore(score: any): 'easy' | 'moderate' | 'difficult' | 'unknown' {
  if (typeof score === 'string') {
    const lower = score.toLowerCase()
    if (['easy', 'moderate', 'difficult', 'unknown'].includes(lower)) {
      return lower as 'easy' | 'moderate' | 'difficult' | 'unknown'
    }
  }
  return 'unknown'
}

function normalizeAvailability(availability: any): 'public' | 'restricted' | 'request' | 'unavailable' {
  if (typeof availability === 'string') {
    const lower = availability.toLowerCase()
    if (['public', 'restricted', 'request', 'unavailable'].includes(lower)) {
      return lower as 'public' | 'restricted' | 'request' | 'unavailable'
    }
  }
  return 'unavailable'
}

function normalizeCodeAvailability(availability: any): 'public' | 'request' | 'unavailable' {
  if (typeof availability === 'string') {
    const lower = availability.toLowerCase()
    if (['public', 'request', 'unavailable'].includes(lower)) {
      return lower as 'public' | 'request' | 'unavailable'
    }
  }
  return 'unavailable'
}

function normalizeSeverity(severity: any): 'critical' | 'important' | 'minor' {
  if (typeof severity === 'string') {
    const lower = severity.toLowerCase()
    if (['critical', 'important', 'minor'].includes(lower)) {
      return lower as 'critical' | 'important' | 'minor'
    }
  }
  return 'minor'
}

function determineConfidence(sources: string[], llmReport: any): 'high' | 'medium' | 'low' {
  // High confidence if we have full text
  if (sources.includes('full_text')) {
    return 'high'
  }
  // Medium confidence if we have abstract
  if (sources.includes('abstract')) {
    return 'medium'
  }
  // Low confidence otherwise
  return 'low'
}
