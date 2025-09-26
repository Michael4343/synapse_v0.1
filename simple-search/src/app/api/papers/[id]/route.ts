
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape'
const SCRAPE_CACHE_HOURS = 24 * 30 // 30 days

function buildCandidateUrls(paper: any): string[] {
  const urls: string[] = []

  // Priority 1: Direct paper URL (most likely to work)
  if (paper.url) {
    urls.push(paper.url)
  }

  // Priority 2: ArXiv URL (free, high success rate)
  if (paper.arxiv_id) {
    urls.push(`https://arxiv.org/abs/${paper.arxiv_id}`)
    urls.push(`https://arxiv.org/pdf/${paper.arxiv_id}.pdf`)
  }

  // Priority 3: DOI URL (often paywalled but authoritative)
  if (paper.doi) {
    urls.push(`https://doi.org/${paper.doi}`)
  }

  return urls
}

async function scrapeWithFirecrawl(url: string): Promise<{ content: string | null; status: string }> {
  if (!FIRECRAWL_API_KEY) {
    console.error('Firecrawl API key is not configured.')
    return { content: null, status: 'no_api_key' }
  }

  try {
    const firecrawlResponse = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        maxAge: 172800000, // 48 hours cache in Firecrawl
      }),
    })

    if (firecrawlResponse.ok) {
      const firecrawlData = await firecrawlResponse.json()
      const content = firecrawlData.data?.markdown
      if (content && content.length > 200) {
        return { content, status: 'success' }
      } else {
        return { content: null, status: 'content_too_short' }
      }
    } else if (firecrawlResponse.status === 402) {
      return { content: null, status: 'paywall' }
    } else if (firecrawlResponse.status === 429) {
      return { content: null, status: 'rate_limited' }
    } else {
      console.error(`Firecrawl API failed with status: ${firecrawlResponse.status}`)
      const errorBody = await firecrawlResponse.text()
      console.error('Firecrawl error body:', errorBody)
      return { content: null, status: 'api_error' }
    }
  } catch (e) {
    console.error('Error scraping with Firecrawl:', e)
    return { content: null, status: 'network_error' }
  }
}

async function updateScrapedContent(paperId: string, content: string | null, url: string | null, status: string) {
  try {
    await supabaseAdmin
      .from(TABLES.SEARCH_RESULTS)
      .update({
        scraped_content: content,
        scraped_at: new Date().toISOString(),
        scraped_url: url,
        scrape_status: status,
      })
      .eq('id', paperId)
  } catch (e) {
    console.error('Error updating scraped content:', e)
  }
}

// Sample papers for testing (matches SAMPLE_PAPERS in page.tsx)
const SAMPLE_PAPERS: Record<string, any> = {
  'sample-1': {
    id: 'sample-1',
    title: 'Attention Is All You Need',
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
    year: 2017,
    venue: 'NeurIPS',
    citation_count: 89247,
    semantic_scholar_id: 'sample-1',
    arxiv_id: '1706.03762',
    doi: '10.48550/arXiv.1706.03762',
    url: 'https://arxiv.org/abs/1706.03762',
    source_api: 'sample_data',
    publication_date: '2017-06-12'
  },
  'sample-2': {
    id: 'sample-2',
    title: 'Language Models are Few-Shot Learners',
    abstract: 'Recent work has demonstrated substantial gains on many NLP tasks and benchmarks by pre-training on a large corpus of text followed by fine-tuning on a specific task. While typically task-agnostic in architecture, this method still requires task-specific fine-tuning datasets of thousands or tens of thousands of examples.',
    authors: ['Tom B. Brown', 'Benjamin Mann', 'Nick Ryder', 'Melanie Subbiah'],
    year: 2020,
    venue: 'NeurIPS',
    citation_count: 42156,
    semantic_scholar_id: 'sample-2',
    arxiv_id: '2005.14165',
    doi: '10.48550/arXiv.2005.14165',
    url: 'https://arxiv.org/abs/2005.14165',
    source_api: 'sample_data',
    publication_date: '2020-05-28'
  },
  'sample-3': {
    id: 'sample-3',
    title: 'Deep Residual Learning for Image Recognition',
    abstract: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions.',
    authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
    year: 2016,
    venue: 'CVPR',
    citation_count: 156892,
    semantic_scholar_id: 'sample-3',
    arxiv_id: '1512.03385',
    doi: '10.1109/CVPR.2016.90',
    url: 'https://arxiv.org/abs/1512.03385',
    source_api: 'sample_data',
    publication_date: '2015-12-10'
  },
  'sample-4': {
    id: 'sample-4',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    abstract: 'We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
    authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
    year: 2019,
    venue: 'NAACL',
    citation_count: 89247,
    semantic_scholar_id: 'sample-4',
    arxiv_id: '1810.04805',
    doi: '10.48550/arXiv.1810.04805',
    url: 'https://arxiv.org/abs/1810.04805',
    source_api: 'sample_data',
    publication_date: '2018-10-11'
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const paperId = resolvedParams.id

  if (!paperId) {
    return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
  }

  console.log(`=== Papers API called with ID: ${paperId} ===`)
  console.log('Available sample papers:', Object.keys(SAMPLE_PAPERS))

  let paper: any

  // 1. Check if this is a sample paper first
  if (SAMPLE_PAPERS[paperId]) {
    paper = SAMPLE_PAPERS[paperId]
    console.log(`✅ Using sample paper: ${paperId}`)
  } else {
    console.log(`❌ Not a sample paper, checking database for: ${paperId}`)
    // 2. Fetch paper details from Supabase
    const { data: dbPaper, error: dbError } = await supabaseAdmin
      .from(TABLES.SEARCH_RESULTS)
      .select('*')
      .eq('id', paperId)
      .single()

    if (dbError || !dbPaper) {
      console.error('Supabase error:', dbError)
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
    }
    paper = dbPaper
  }

  // 2. Check if we have fresh scraped content (within cache period)
  let scrapedContent = paper.scraped_content
  const scrapedAt = paper.scraped_at ? new Date(paper.scraped_at) : null
  const cacheExpiryTime = new Date(Date.now() - (SCRAPE_CACHE_HOURS * 60 * 60 * 1000))
  const hasFreshContent = scrapedAt && scrapedAt > cacheExpiryTime

  // 3. If no fresh content, attempt to scrape
  if (!hasFreshContent) {
    const candidateUrls = buildCandidateUrls(paper)

    if (candidateUrls.length > 0) {
      let bestResult = { content: null, status: 'no_urls', url: null }

      // Try each URL until we get content
      for (const url of candidateUrls) {
        console.log(`Attempting to scrape: ${url}`)
        const result = await scrapeWithFirecrawl(url)

        if (result.content) {
          bestResult = { ...result, url }
          console.log(`Successfully scraped content from: ${url}`)
          break
        } else {
          console.log(`Failed to scrape ${url}: ${result.status}`)
        }
      }

      // Update database with results (only for non-sample papers)
      if (!SAMPLE_PAPERS[paperId]) {
        await updateScrapedContent(paperId, bestResult.content, bestResult.url, bestResult.status)
      } else {
        console.log('Skipping database update for sample paper')
      }
      scrapedContent = bestResult.content
    }
  }

  // 4. Return combined data
  return NextResponse.json({
    ...paper,
    scrapedContent,
  })
}
