
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/scrape'
const SCRAPE_CACHE_HOURS = 24 * 30 // 30 days
const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

function assessContentQuality(content: string, url: string): { quality: 'full_paper' | 'abstract_only' | 'insufficient'; contentType: 'html' | 'pdf' | 'abstract' | 'other' } {
  const length = content.length

  // Determine content type from URL
  let contentType: 'html' | 'pdf' | 'abstract' | 'other' = 'other'
  if (url.includes('/html/')) {
    contentType = 'html'
  } else if (url.includes('/pdf/') || url.includes('.pdf')) {
    contentType = 'pdf'
  } else if (url.includes('/abs/')) {
    contentType = 'abstract'
  }

  // Quality assessment based on length and content type
  if (length < 500) {
    return { quality: 'insufficient', contentType }
  }

  // For HTML/PDF sources, expect much longer content for full papers
  if (contentType === 'html' || contentType === 'pdf') {
    if (length >= 5000) {
      return { quality: 'full_paper', contentType }
    } else if (length >= 1500) {
      // Medium length could be partial content or short papers
      return { quality: 'abstract_only', contentType } // Conservative assessment
    } else {
      return { quality: 'abstract_only', contentType }
    }
  }

  // For abstract pages, anything substantial is expected to be abstract-only
  if (contentType === 'abstract') {
    return { quality: 'abstract_only', contentType }
  }

  // For other sources, use conservative thresholds
  if (length >= 3000) {
    return { quality: 'full_paper', contentType }
  } else {
    return { quality: 'abstract_only', contentType }
  }
}

function buildCandidateUrls(paper: any): string[] {
  const urls: string[] = []

  // Priority 1: Direct paper URL (most likely to work)
  if (paper.url) {
    urls.push(paper.url)
  }

  // Priority 2: ArXiv full content sources (prioritize HTML over PDF over abstract)
  if (paper.arxiv_id) {
    // Try HTML version first (full paper when available)
    urls.push(`https://arxiv.org/html/${paper.arxiv_id}`)
    // Fallback to PDF (full paper, requires text extraction)
    urls.push(`https://arxiv.org/pdf/${paper.arxiv_id}.pdf`)
  }

  // Priority 3: DOI URL (often paywalled but authoritative)
  if (paper.doi) {
    urls.push(`https://doi.org/${paper.doi}`)
  }

  // Priority 4: ArXiv abstract page (fallback - contains only abstract + metadata)
  if (paper.arxiv_id) {
    urls.push(`https://arxiv.org/abs/${paper.arxiv_id}`)
  }

  return urls
}

async function scrapeWithFirecrawl(url: string): Promise<{ content: string | null; htmlContent: string | null; status: string; quality?: 'full_paper' | 'abstract_only' | 'insufficient'; contentType?: 'html' | 'pdf' | 'abstract' | 'other' }> {
  if (!FIRECRAWL_API_KEY) {
    console.error('Firecrawl API key is not configured.')
    return { content: null, htmlContent: null, status: 'no_api_key' }
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
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        maxAge: 172800000, // 48 hours cache in Firecrawl
      }),
    })

    if (firecrawlResponse.ok) {
      const firecrawlData = await firecrawlResponse.json()
      const content = firecrawlData.data?.markdown
      const htmlContent = firecrawlData.data?.html

      if (content && content.trim()) {
        const qualityAssessment = assessContentQuality(content, url)

        if (qualityAssessment.quality === 'insufficient') {
          return {
            content: null,
            htmlContent: null,
            status: 'content_too_short',
            quality: qualityAssessment.quality,
            contentType: qualityAssessment.contentType
          }
        }

        // Return content with quality information
        return {
          content,
          htmlContent,
          status: 'success',
          quality: qualityAssessment.quality,
          contentType: qualityAssessment.contentType
        }
      } else {
        return { content: null, htmlContent: null, status: 'no_content' }
      }
    } else if (firecrawlResponse.status === 402) {
      return { content: null, htmlContent: null, status: 'paywall' }
    } else if (firecrawlResponse.status === 429) {
      return { content: null, htmlContent: null, status: 'rate_limited' }
    } else {
      console.error(`Firecrawl API failed with status: ${firecrawlResponse.status}`)
      const errorBody = await firecrawlResponse.text()
      console.error('Firecrawl error body:', errorBody)
      return { content: null, htmlContent: null, status: 'api_error' }
    }
  } catch (e) {
    console.error('Error scraping with Firecrawl:', e)
    return { content: null, htmlContent: null, status: 'network_error' }
  }
}

async function updateScrapedContent(paperId: string, content: string | null, url: string | null, status: string, quality?: string, contentType?: string) {
  try {
    await supabaseAdmin
      .from(TABLES.SEARCH_RESULTS)
      .update({
        scraped_content: content,
        scraped_at: new Date().toISOString(),
        scraped_url: url,
        scrape_status: status,
        content_quality: quality || null,
        content_type: contentType || null,
      })
      .eq('id', paperId)
  } catch (e) {
    console.error('Error updating scraped content:', e)
  }
}

function cleanGeminiResponse(rawResponse: string): { cleanedJson: string; status: string } {
  let cleaned = rawResponse.trim()

  // Remove markdown code block wrappers
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '')
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '')
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '')
  }

  // Remove any remaining markdown artifacts
  cleaned = cleaned.replace(/^`+|`+$/g, '')

  // Clean up whitespace and normalize
  cleaned = cleaned.trim()

  // Basic validation - check if it looks like JSON
  if (!cleaned.startsWith('{') || !cleaned.includes('"sections"')) {
    return { cleanedJson: cleaned, status: 'not_json_structure' }
  }

  // Check for common truncation indicators
  if (!cleaned.endsWith('}') && !cleaned.includes('"metadata"')) {
    return { cleanedJson: cleaned, status: 'truncated_response' }
  }

  return { cleanedJson: cleaned, status: 'cleaned_successfully' }
}

async function processWithGemini(content: string, paperTitle: string): Promise<{ processedContent: string | null; status: string }> {
  if (!GOOGLE_API_KEY) {
    console.error('Google API key is not configured.')
    return { processedContent: null, status: 'no_api_key' }
  }

  // Input validation and logging
  console.log('=== GEMINI PROCESSING START ===')
  console.log('Paper title:', paperTitle)
  console.log('Input content length:', content.length)
  console.log('Input content preview:', content.slice(0, 300) + '...')

  if (!content || content.length < 500) {
    console.warn('Input content is very short or empty')
    return { processedContent: null, status: 'input_too_short' }
  }

  // Content length management
  let processableContent = content
  if (content.length > 80000) {
    console.warn('Content is very long, applying content management strategy')

    // Strategy: Keep first 60% and last 20%, skip middle to preserve structure
    const keepStart = Math.floor(content.length * 0.6)
    const keepEnd = Math.floor(content.length * 0.2)
    const startContent = content.slice(0, keepStart)
    const endContent = content.slice(-keepEnd)

    processableContent = startContent + '\n\n[... content truncated for processing ...]\n\n' + endContent
    console.log('Reduced content length from', content.length, 'to', processableContent.length)
  }

  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    })

    const prompt = `You are an expert academic paper processor. Your task is to extract and organize research paper content into structured JSON format.

CRITICAL OUTPUT REQUIREMENT:
Return ONLY raw JSON. Do NOT wrap in markdown code blocks. Do NOT use \`\`\`json or \`\`\`. Do NOT add any explanatory text before or after the JSON.

WRONG OUTPUT EXAMPLES:
- \`\`\`json {...} \`\`\` (NO markdown blocks)
- "Here is the JSON: {...}" (NO explanatory text)
- \`{...}\` (NO backticks)

CORRECT OUTPUT: Start immediately with { and end with }

CONTENT PROCESSING RULES:
1. Remove ALL ArXiv metadata, navigation menus, headers/footers, ads
2. Remove LaTeX artifacts: \\section{}, \\subsection{}, \\cite{}, \\ref{}, etc.
3. Remove duplicate title/author information
4. Keep scientific accuracy and technical terminology
5. Clean up broken sentences from PDF extraction
6. Remove figure/table references to missing items

JSON STRUCTURE (copy this exactly):
{
  "title": "Clean paper title",
  "sections": [
    {
      "type": "abstract",
      "title": "Abstract",
      "content": "Clean abstract text"
    },
    {
      "type": "introduction",
      "title": "Introduction",
      "content": "Introduction content"
    },
    {
      "type": "methods",
      "title": "Methods",
      "content": "Methods content"
    },
    {
      "type": "results",
      "title": "Results",
      "content": "Results content"
    },
    {
      "type": "discussion",
      "title": "Discussion",
      "content": "Discussion content"
    },
    {
      "type": "conclusion",
      "title": "Conclusion",
      "content": "Conclusion content"
    }
  ],
  "metadata": {
    "processed_successfully": true,
    "content_quality": "high"
  }
}

ALLOWED SECTION TYPES: "abstract", "introduction", "methods", "results", "discussion", "conclusion", "related_work", "background", "evaluation", "limitations", "future_work", "other"

MATH FORMATTING: Use $x^2$ for inline math, $$x^2$$ for display math

Paper Title: ${paperTitle}

Raw Content:
${processableContent}

Remember: Output ONLY raw JSON starting with { and ending with }`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const rawResponse = response.text()

    console.log('Raw Gemini response length:', rawResponse.length)
    console.log('Raw Gemini response preview:', rawResponse.slice(0, 200) + '...')

    // Clean the response to remove markdown formatting
    const { cleanedJson, status: cleanStatus } = cleanGeminiResponse(rawResponse)

    if (cleanStatus === 'not_json_structure') {
      console.error('Gemini response does not appear to be JSON structure')
      return { processedContent: null, status: 'not_json_format' }
    }

    if (cleanStatus === 'truncated_response') {
      console.warn('Gemini response appears to be truncated')
      // Continue processing but log the issue
    }

    console.log('Cleaned JSON length:', cleanedJson.length)
    console.log('Cleaned JSON preview:', cleanedJson.slice(0, 200) + '...')

    // Validate JSON structure
    try {
      const parsedJson = JSON.parse(cleanedJson)
      if (parsedJson.sections && Array.isArray(parsedJson.sections) && parsedJson.sections.length > 0) {
        console.log('Successfully parsed JSON with', parsedJson.sections.length, 'sections')
        return { processedContent: cleanedJson, status: 'success' }
      } else {
        console.error('Gemini returned valid JSON but invalid structure:', parsedJson)
        return { processedContent: null, status: 'invalid_structure' }
      }
    } catch (jsonError) {
      console.error('=== JSON PARSING FAILED ===')
      console.error('Parse error:', jsonError)
      console.error('Cleaned content length:', cleanedJson.length)
      console.error('Cleaned content sample:', cleanedJson.slice(0, 1000))
      console.error('Content ends with:', cleanedJson.slice(-100))
      return { processedContent: null, status: 'invalid_json_after_cleaning' }
    }
  } catch (e) {
    console.error('=== GEMINI API ERROR ===')
    console.error('Error details:', e)
    console.error('Error type:', typeof e)
    console.error('Error message:', e instanceof Error ? e.message : String(e))
    return { processedContent: null, status: 'api_error' }
  } finally {
    console.log('=== GEMINI PROCESSING END ===')
  }
}

async function updateProcessedContent(paperId: string, content: string | null, status: string) {
  try {
    await supabaseAdmin
      .from(TABLES.SEARCH_RESULTS)
      .update({
        processed_content: content,
        processed_at: new Date().toISOString(),
        processing_status: status,
      })
      .eq('id', paperId)
  } catch (e) {
    console.error('Error updating processed content:', e)
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

  // 2. Check if we have fresh scraped and processed content
  let scrapedContent = paper.scraped_content
  let processedContent = paper.processed_content
  const scrapedAt = paper.scraped_at ? new Date(paper.scraped_at) : null
  const cacheExpiryTime = new Date(Date.now() - (SCRAPE_CACHE_HOURS * 60 * 60 * 1000))
  const hasFreshContent = scrapedAt && scrapedAt > cacheExpiryTime

  // 3. If no fresh content, attempt to scrape
  if (!hasFreshContent) {
    const candidateUrls = buildCandidateUrls(paper)

    if (candidateUrls.length > 0) {
      let bestResult: any = { content: null, htmlContent: null, status: 'no_urls', url: null, quality: null, contentType: null }

      // Try each URL with smart quality-based selection
      for (const url of candidateUrls) {
        console.log(`Attempting to scrape: ${url}`)
        const result = await scrapeWithFirecrawl(url)

        if (result.content) {
          console.log(`Scraped content from ${url}: ${result.content.length} chars, quality: ${result.quality}, type: ${result.contentType}`)

          // If this is our first successful result, or it's better quality than what we have
          if (!bestResult.content ||
              (result.quality === 'full_paper' && bestResult.quality !== 'full_paper') ||
              (result.quality === 'full_paper' && bestResult.quality === 'full_paper' && result.content.length > bestResult.content.length)) {
            bestResult = { ...result, url }
          }

          // If we got full paper quality, we're done
          if (result.quality === 'full_paper') {
            console.log(`Found full paper content from: ${url}`)
            break
          }
        } else {
          console.log(`Failed to scrape ${url}: ${result.status}`)
        }
      }

      // Update database with scraped results (only for non-sample papers)
      if (!SAMPLE_PAPERS[paperId]) {
        await updateScrapedContent(paperId, bestResult.content, bestResult.url, bestResult.status, bestResult.quality, bestResult.contentType)
      } else {
        console.log('Skipping database update for sample paper')
      }
      scrapedContent = bestResult.content

      // 4. Process with Gemini if we have HTML content
      if (bestResult.htmlContent && bestResult.content) {
        console.log('Processing content with Gemini...')
        const geminiResult = await processWithGemini(bestResult.htmlContent, paper.title)

        if (geminiResult.processedContent) {
          processedContent = geminiResult.processedContent
          console.log('Successfully processed content with Gemini')

          // Update database with processed content (only for non-sample papers)
          if (!SAMPLE_PAPERS[paperId]) {
            await updateProcessedContent(paperId, processedContent, geminiResult.status)
          }
        } else {
          console.log(`Gemini processing failed: ${geminiResult.status}`)
        }
      }
    }
  }

  // 5. Return combined data
  return NextResponse.json({
    ...paper,
    scrapedContent,
    processedContent,
    // Include content quality information for UI indicators
    contentQuality: paper.content_quality || null,
    contentType: paper.content_type || null,
    scrapedUrl: paper.scraped_url || null,
  })
}
