import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

interface ApiSearchResult {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  semanticScholarId: string
  arxivId: string | null
  doi: string | null
  url: string | null
  source: string
}

interface CompileRequest {
  paper: ApiSearchResult
  options?: {
    listName?: string
    maxResults?: number
  }
}

interface CompileResponse {
  success: boolean
  list?: {
    id: number
    name: string
    items_count: number
  }
  papers?: ApiSearchResult[]
  researchSummary?: string
  message: string
}

export async function POST(request: NextRequest): Promise<NextResponse<CompileResponse>> {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 })
    }

    const body: CompileRequest = await request.json()
    const { paper, options } = body

    if (!paper || !paper.title) {
      return NextResponse.json({
        success: false,
        message: 'Paper data is required'
      }, { status: 400 })
    }

    const apiKey = process.env.PERPLEXITY_API_KEY

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'Perplexity API not configured'
      }, { status: 500 })
    }

    // Generate research query based on paper content
    const researchQuery = generateResearchQuery(paper)

    // Call Perplexity Sonar Deep Research API
    const researchResults = await callPerplexityDeepResearch(researchQuery, apiKey)

    // Parse research results to extract related papers
    const relatedPapers = parseResearchResults(researchResults, options?.maxResults || 12)

    if (relatedPapers.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No related papers found in research results'
      }, { status: 404 })
    }

    // Create new list with auto-generated name
    const listName = options?.listName || generateListName(paper)

    const { data: newList, error: listError } = await supabase
      .from('user_lists')
      .insert({
        user_id: user.id,
        name: listName
      })
      .select()
      .single()

    if (listError) {
      console.error('Database error creating list:', listError)
      return NextResponse.json({
        success: false,
        message: 'Failed to create research list'
      }, { status: 500 })
    }

    // Add papers to the list
    const listItems = relatedPapers.map(paper => ({
      list_id: newList.id,
      paper_data: paper
    }))

    const { error: itemsError } = await supabase
      .from('list_items')
      .insert(listItems)

    if (itemsError) {
      console.error('Database error adding papers:', itemsError)
      // Clean up the list if paper insertion failed
      await supabase
        .from('user_lists')
        .delete()
        .eq('id', newList.id)

      return NextResponse.json({
        success: false,
        message: 'Failed to add papers to research list'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      list: {
        id: newList.id,
        name: newList.name,
        items_count: relatedPapers.length
      },
      papers: relatedPapers,
      researchSummary: extractResearchSummary(researchResults),
      message: `Successfully compiled ${relatedPapers.length} related papers`
    })

  } catch (error) {
    console.error('Research compile error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal server error during research compilation'
    }, { status: 500 })
  }
}

function generateResearchQuery(paper: ApiSearchResult): string {
  const title = paper.title
  const abstract = paper.abstract ? paper.abstract.slice(0, 500) : ''
  const authors = paper.authors.slice(0, 3).join(', ')
  const venue = paper.venue || ''

  return `Conduct comprehensive academic research to find papers closely related to this research paper:

Title: "${title}"
Authors: ${authors}
${venue ? `Published in: ${venue}` : ''}
${abstract ? `Abstract: ${abstract}` : ''}

Please find and cite 12-15 highly relevant academic papers that:
1. Study similar research questions or methodologies
2. Build upon or extend this work
3. Use similar approaches or techniques
4. Address related problems in the same field
5. Could be considered competing approaches

For each paper you find, please include:
- Full title
- Author names
- Publication year
- Journal/conference name
- Brief description of relevance
- DOI or URL when available

Focus on recent, high-quality publications from reputable venues and provide comprehensive coverage of related work in this research area.`
}

async function callPerplexityDeepResearch(query: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'sonar-deep-research',
      messages: [
        {
          role: 'user',
          content: query
        }
      ]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Perplexity API error: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content in Perplexity API response')
  }

  return content
}

function parseResearchResults(researchText: string, maxResults: number): ApiSearchResult[] {
  const papers: ApiSearchResult[] = []

  // Look for patterns that indicate academic papers
  // This is a simplified parser - in production you'd want more sophisticated parsing
  const titleRegex = /(?:Title:|Paper:|Study:)\s*"([^"]+)"/gi
  const authorRegex = /(?:Authors?:|By:)\s*([^\n]+)/gi
  const yearRegex = /(?:Year:|Published:|)\s*(\d{4})/gi
  const venueRegex = /(?:Journal:|Conference:|Published in:)\s*([^\n]+)/gi
  const doiRegex = /(?:DOI:|doi:|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d+\/[^\s]+)/gi

  let titleMatch: RegExpExecArray | null
  let paperIndex = 0

  // Simple parsing approach - look for title patterns
  while ((titleMatch = titleRegex.exec(researchText)) !== null && paperIndex < maxResults) {
    const title = titleMatch[1].trim()
    if (!title || title.length < 10) continue // Skip very short titles

    // Try to extract other information near this title
    const contextStart = Math.max(0, titleMatch.index - 200)
    const contextEnd = Math.min(researchText.length, titleMatch.index + 500)
    const context = researchText.slice(contextStart, contextEnd)

    const authors = extractAuthorsFromContext(context)
    const year = extractYearFromContext(context)
    const venue = extractVenueFromContext(context)
    const doi = extractDoiFromContext(context)

    papers.push({
      id: `research_${Date.now()}_${paperIndex}`,
      title,
      abstract: null, // Research results typically don't include full abstracts
      authors: authors,
      year: year,
      venue: venue,
      citationCount: null,
      semanticScholarId: '',
      arxivId: null,
      doi: doi,
      url: doi ? `https://doi.org/${doi}` : null,
      source: 'perplexity_research'
    })

    paperIndex++
  }

  return papers
}

function extractAuthorsFromContext(context: string): string[] {
  const authorMatch = context.match(/(?:Authors?:|By:)\s*([^\n]+)/i)
  if (!authorMatch) return []

  const authorString = authorMatch[1].trim()
  // Split by common delimiters and clean up
  return authorString
    .split(/[,;&]/)
    .map(author => author.trim())
    .filter(author => author.length > 0 && author.length < 100)
    .slice(0, 10) // Limit to reasonable number of authors
}

function extractYearFromContext(context: string): number | null {
  const yearMatch = context.match(/\b(20\d{2}|19\d{2})\b/)
  return yearMatch ? parseInt(yearMatch[1]) : null
}

function extractVenueFromContext(context: string): string | null {
  const venueMatch = context.match(/(?:Journal:|Conference:|Published in:)\s*([^\n]+)/i)
  if (!venueMatch) return null

  const venue = venueMatch[1].trim()
  return venue.length > 0 && venue.length < 200 ? venue : null
}

function extractDoiFromContext(context: string): string | null {
  const doiMatch = context.match(/(?:DOI:|doi:|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d+\/[^\s]+)/i)
  return doiMatch ? doiMatch[1] : null
}

function generateListName(paper: ApiSearchResult): string {
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  const shortTitle = paper.title.length > 50
    ? paper.title.slice(0, 47) + '...'
    : paper.title

  return `Research: ${shortTitle} (${timestamp})`
}

function extractResearchSummary(researchText: string): string {
  // Extract first paragraph or first few sentences as summary
  const sentences = researchText.split(/[.!?]+/)
  const summary = sentences.slice(0, 3).join('. ').trim()

  return summary.length > 10
    ? summary + (summary.endsWith('.') ? '' : '.')
    : 'Deep research completed successfully.'
}