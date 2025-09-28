import { NextRequest, NextResponse } from 'next/server'
import { fetchOrcidWorks } from '@/lib/profile-enrichment'

interface RequestBody {
  orcidId: string
}

function extractKeywordsFromWorks(works: any[]): string[] {
  const keywordCounts = new Map<string, number>()

  for (const work of works) {
    const text = [work.title, work.abstract, work.journal].filter(Boolean).join(' ')
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9#+-]+/)
      .filter((token) => token.length > 3 && token.length < 30)

    for (const token of tokens) {
      keywordCounts.set(token, (keywordCounts.get(token) ?? 0) + 1)
    }
  }

  // Get top keywords, sorted by frequency
  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword]) => keyword)
    .filter(keyword => {
      // Filter out common academic words
      const commonWords = ['research', 'study', 'analysis', 'using', 'based', 'approach', 'method', 'results', 'data', 'paper', 'article', 'journal', 'conference', 'proceedings']
      return !commonWords.includes(keyword)
    })
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

    // Extract keywords from works
    const keywords = extractKeywordsFromWorks(orcidResult.works)

    return NextResponse.json({
      keywords,
      worksCount: orcidResult.works.length,
      message: keywords.length > 0 ? `Generated ${keywords.length} keywords from ${orcidResult.works.length} publications` : 'No meaningful keywords could be extracted'
    })

  } catch (error) {
    console.error('Keywords from ORCID error:', error)
    return NextResponse.json(
      { error: 'Failed to generate keywords from ORCID' },
      { status: 500 }
    )
  }
}