import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Resend } from 'resend'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const simpleSearchRoot = path.resolve(__dirname, '..', '..')
const workspaceRoot = path.resolve(simpleSearchRoot, '..')

const PROMPT_TEMPLATE_PATH = path.join(workspaceRoot, 'COMPILE SIMILAR PAPERS.md')

const GEMINI_FORMATTING_PROMPT = String.raw`You are refining a deep-research briefing so it 
 
 can be saved in Evidentia’s database. Convert   
 
 the analysis into the exact JSON shape below and
 
 return ONLY valid minified JSON (no markdown,   
 
 commentary, or extra text).                     
 
 
 
 SCHEMA                                          
 
 {                                               
 
   "paper": {                                    
 
     "title": string,                           
 
     "doiOrId": string,                         
 
     "authors": string,                         
 
     "venue": string,                           
 
     "doi": string|null                         
 
   },                                            
 
   "reproducibility": {                         
 
     "overallVerdict": string,                  
 
     "feasibilitySnapshot": [                   
 
       {                                         
 
         "question": string,                    
 
         "whyItMatters": string                
 
       }                                         
 
       // 4-6 more                                
 
     ]                                           
 
   },                                            
 
   "methodFindingCrosswalk": {                  
 
     "papers": [                                
 
       {                                         
 
         "id": string,                         
 
         "title": string,                      
 
         "authors": string,                    
 
         "venue": string,                      
 
         "year": string,                       
 
         "citationCount": integer|null,        
 
         "clusterLabel": "Sample and         
 
 model"|"Field deployments"|"Insight primers",   
 
         "summary": string,                    
 
         "highlight": "Signal from abstract:  
 
 …"|"Signal from editorial or summary in       
 
 <venue>",                                      
 
         "matrix": {                           
 
           "sampleModel": string,               
 
           "materialsRatios": string,           
 
           "equipmentSetup": string,            
 
           "procedureSteps": string,            
 
           "controls": string,                  
 
           "outputsMetrics": string,            
 
           "qualityChecks": string,             
 
           "outcomeSummary": string             
 
         }                                       
 
       }                                         
 
       // add 2-4 more objects                   
 
     ]                                           
 
   }                                             
 
 }                                               
 
 
 
 GLOBAL RULES                                   
 
 - Use Plain English. Avoid domain-specific      
 
 or medical jargon. Prefer general words         
 
 like “equipment”, “materials”, “samples”,       
 
 “procedure”, “quality checks”.                  
 
 - Return minified JSON (single line, no extra   
 
 spaces or newlines). No code fences or text     
 
 around it.                                      
 
 - Escape embedded quotes with ". Backslashes    
 
 must be \\.                                     
 
 - All arrays must be non-empty.                 
 
 - If information is missing, use null or “not   
 
 reported”.                                      
 
 - Validate JSON with JSON.parse before returning
 
 to confirm it’s valid and has no trailing       
 
 commas.                                        
 
 
 
 PAPER BLOCK                                     
 
 - title: exact paper title.                     
 
 - doiOrId: DOI, arXiv ID, or stable identifier. 
 
 - authors: “FirstAuthor et al.” when there are  
 
 3+ authors.                                     
 
 - venue: journal, conference, or preprint server
 
 name.                                           
 
 - doi: full DOI string or null.                 
 
 
 
 REPRODUCIBILITY                                 
 
 - overallVerdict: one sentence using “Highly    
 
 reproducible for…”, “Moderately reproducible    
 
 with…”, or “Limited reproducibility due to…”.   
 
 - feasibilitySnapshot: 5-7 yes/no capability    
 
 checks.                                         
 
   • Each question must start with “Do you have”,
 
 “Can you”, or “Are you equipped to”.            
 
   • Each whyItMatters explains in one sentence  
 
 why the capability matters for this paper.      
 
   • Use plain language and make each item       
 
 concrete and checkable.                         
 
 
 
 METHOD & FINDING CROSSWALK                      
 
 - papers: 3-5 entries prioritising method       
 
 overlap.                                        
 
   • id: stable identifier (source ID, hash,     
 
 or slug).                                       
 
   • authors: concise author line (e.g., “Smith  
 
 et al.”).                                      
 
   • year: four-digit string.                    
 
   • citationCount: integer or null.             
 
   • clusterLabel: one of the three allowed      
 
 strings.                                       
 
   • summary: 2-3 sentences explaining the       
 
 methodological link in plain terms.            
 
   • highlight: “Signal from abstract: …” if     
 
 abstract offers a clear take-away, otherwise    
 
 “Signal from editorial or summary in <venue>”.  
 
   • matrix: fill each key with concise, jargon- 
 
 free descriptions. Use “not reported” when      
 
 information is missing.                         
 
 
 
 VALIDATION CHECKLIST (perform before returning) 
 
 - Exactly one “paper” object, one               
 
 “reproducibility” object, and one               
 
 “methodFindingCrosswalk” object.                
 
 - feasibilitySnapshot length 5-7.               
 
 - papers length 3-5.                            
 
 - clusterLabel values in allowed set.           
 
 - highlight follows the required patterns.      
 
 - All matrix keys present for every paper.      
 
 - JSON is minified and valid (no trailing       
 
 commas, correct escaping, boolean literals,     
 
 null literals).                                 
 
 
 
 TASK                                            
 
 Read the deep-research briefing, map every      
 
 relevant detail into the schema, enforce all    
 
 constraints above, then output the single-line  
 
 JSON.`

const CLUSTER_LABELS = new Set([
  'Sample and model',
  'Field deployments',
  'Insight primers'
])

const HIGHLIGHT_PATTERNS = [
  /^Signal from abstract: /,
  /^Signal from editorial or summary in .+$/
]

let cachedPromptTemplate = null
let cachedResendClient = null

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }
  if (cachedResendClient) {
    return cachedResendClient
  }
  cachedResendClient = new Resend(apiKey)
  return cachedResendClient
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function loadEnvFiles() {
  const candidatePaths = [
    path.join(simpleSearchRoot, '.env.local'),
    path.join(simpleSearchRoot, '.env'),
    path.join(workspaceRoot, '.env.local'),
    path.join(workspaceRoot, '.env')
  ]

  for (const filePath of candidatePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      if (!content) {
        continue
      }
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) {
          continue
        }
        const idx = line.indexOf('=')
        if (idx <= 0) {
          continue
        }
        const key = line.slice(0, idx).trim()
        let value = line.slice(idx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (!(key in process.env)) {
          process.env[key] = value
        }
      }
    } catch (error) {
      // ignore missing files
    }
  }
}

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'x-cli-tool': 'deep-research' } }
  })
}

export async function fetchActiveResearchers(supabase) {
  const { data, error } = await supabase
    .from('researchers')
    .select('id, display_name, contact_email, research_interests')
    .eq('status', 'active')
    .order('display_name', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch researchers: ${error.message}`)
  }

  return data || []
}

async function readPromptTemplate() {
  if (cachedPromptTemplate) {
    return cachedPromptTemplate
  }

  try {
    const content = await fs.readFile(PROMPT_TEMPLATE_PATH, 'utf8')
    cachedPromptTemplate = content
    return content
  } catch (error) {
    throw new Error(`Unable to load deep research prompt from ${PROMPT_TEMPLATE_PATH}: ${error.message}`)
  }
}

function formatAuthors(authors) {
  if (!authors || !Array.isArray(authors) || authors.length === 0) {
    return 'Not provided'
  }
  if (authors.length === 1) {
    return authors[0]
  }
  return `${authors[0]} et al.`
}

function normaliseVenue(venue) {
  return venue || 'Not reported'
}

function coalesceIdentifier(paper) {
  return paper?.doi || paper?.arxivId || paper?.semanticScholarId || paper?.id || 'not-reported'
}

function buildTargetDetails(paper) {
  const lines = []
  lines.push(`Title: ${paper.title || 'Untitled paper'}`)
  lines.push(`Authors: ${Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || 'Not reported')}`)
  if (paper.venue) {
    lines.push(`Venue: ${paper.venue}`)
  }
  if (paper.year) {
    lines.push(`Year: ${paper.year}`)
  }
  if (paper.doi) {
    lines.push(`DOI: ${paper.doi}`)
  } else if (paper.arxivId) {
    lines.push(`arXiv: ${paper.arxivId}`)
  }
  if (paper.url) {
    lines.push(`Primary link: ${paper.url}`)
  }
  if (paper.abstract) {
    lines.push('---')
    lines.push('Abstract snippet:')
    lines.push(paper.abstract.slice(0, 1000))
  }
  return lines.join('\n')
}

export async function buildPerplexityPrompt({ paper, researcher, relatedPapers = [] }) {
  if (!paper?.title) {
    throw new Error('Cannot build prompt without paper title')
  }

  const template = await readPromptTemplate()
  const placeholder = '**[INSERT PAPER TITLE/DOI/TOPIC]**'
  const detailsBlock = buildTargetDetails(paper)
  const replacement = `**${paper.title}**\n\n${detailsBlock}`
  const promptBody = template.replace(placeholder, replacement)

  const researcherBlock = researcher
    ? [
        '',
        '---',
        'Researcher context:',
        `Name: ${researcher.display_name}`,
        `Email: ${researcher.contact_email}`,
        `Research interests: ${(Array.isArray(researcher.research_interests) && researcher.research_interests.length)
          ? researcher.research_interests.join(', ')
          : 'Not reported'}`,
      ].join('\n')
    : ''

  const relatedBlock = Array.isArray(relatedPapers) && relatedPapers.length
    ? ['','---','Candidate papers to prioritise:', ...relatedPapers.map((item, index) => {
        const title = item.title || `Paper ${index + 1}`
        const url = item.url ? ` (${item.url})` : ''
        const venue = item.venue ? ` — ${item.venue}` : ''
        return `- ${title}${venue}${url}`
      })].join('\n')
    : ''

  return [promptBody, researcherBlock, relatedBlock].join('\n')
}

export function buildPerplexitySystemPrompt() {
  return [
    'You are a meticulous research assistant who compiles deep literature analyses for lab reproducibility teams.',
    'Follow every instruction in the user prompt verbatim and return a comprehensive briefing that can be handed to another analyst without additional edits.',
    'Cite sources inline, note missing information, and structure the response clearly with sections that mirror the requested output.'
  ].join(' ')
}

export async function callPerplexity({ prompt, apiKey, timeoutMs = 60000, maxRetries = 2 }) {
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY is not configured')
  }

  const body = {
    model: 'sonar-deep-research',
    messages: [
      { role: 'system', content: buildPerplexitySystemPrompt() },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const started = Date.now()

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      const durationMs = Date.now() - started

      if (!response.ok) {
        const errorText = await safeReadBody(response)
        if (attempt < maxRetries && shouldRetryStatus(response.status)) {
          await delay(exponentialBackoff(attempt))
          continue
        }
        const error = new Error(`Perplexity request failed (${response.status}): ${errorText}`)
        error.status = response.status
        error.details = errorText
        throw error
      }

      const payload = await response.json()
      const content = extractMessageContent(payload)
      if (!content) {
        const error = new Error('Perplexity response missing content')
        error.status = 500
        throw error
      }

      return {
        content,
        durationMs
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        if (attempt < maxRetries) {
          await delay(exponentialBackoff(attempt))
          continue
        }
        const timeoutError = new Error('Perplexity request timed out')
        timeoutError.status = 408
        throw timeoutError
      }
      if (attempt < maxRetries) {
        await delay(exponentialBackoff(attempt))
        continue
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error('Perplexity request failed after retries')
}

function shouldRetryStatus(status) {
  return status === 429 || status === 408 || status >= 500
}

function exponentialBackoff(attempt) {
  const base = 750
  return base * Math.pow(2, attempt)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function safeReadBody(response) {
  try {
    return await response.text()
  } catch (error) {
    return ''
  }
}

function extractMessageContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return null
  }
  return content.trim()
}

export function stripPerplexityReasoning(rawContent) {
  if (!rawContent) {
    return ''
  }
  return rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

export function isPerplexityCreditError(error) {
  if (!error) {
    return false
  }
  const message = typeof error === 'string'
    ? error
    : error instanceof Error && error.message
      ? error.message
      : String(error)

  const lowered = message.toLowerCase()
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 402) {
    return true
  }
  return lowered.includes('402') || lowered.includes('insufficient credit') || lowered.includes('payment required')
}

export async function formatWithGemini({ analysisText, apiKey, model = 'gemini-2.0-flash' }) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const client = new GoogleGenerativeAI(apiKey)
  const generativeModel = client.getGenerativeModel({
    model,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048
    }
  })

  const prompt = [
    GEMINI_FORMATTING_PROMPT,
    '',
    'DEEP-RESEARCH BRIEFING START',
    '<<<BEGIN>>>',
    analysisText,
    '<<<END>>>',
    'DEEP-RESEARCH BRIEFING END'
  ].join('\n')

  const result = await generativeModel.generateContent(prompt)
  const response = await result.response
  const text = response?.text?.()
  if (!text) {
    throw new Error('Gemini response missing text payload')
  }
  return text.trim()
}

export async function sendPromptEmail({ researcher, paperTitle, prompt }) {
  const resend = getResendClient()
  const from = process.env.RESEND_FROM_EMAIL

  if (!resend || !from) {
    throw new Error('Resend is not configured (set RESEND_API_KEY and RESEND_FROM_EMAIL)')
  }

  const to = researcher?.contact_email
  if (!to) {
    throw new Error('Researcher contact email is missing; cannot send fallback email')
  }

  const subject = `Deep research prompt: ${paperTitle || 'Target paper'}`
  const preview = researcher?.display_name ? `Hi ${researcher.display_name.split(' ')[0]},` : 'Hello,'
  const html = [
    `<p>${escapeHtml(preview)}</p>`,
    '<p>Perplexity credits are exhausted, so here is the deep-research prompt to run manually:</p>',
    `<pre style="white-space:pre-wrap;font-family:monospace;background:#f4f4f4;padding:12px;border-radius:4px;">${escapeHtml(prompt)}</pre>`,
    '<p>Once you have the analysis, continue with Gemini formatting and ingestion as usual.</p>'
  ].join('')

  const text = `${preview}

Perplexity credits are exhausted, so here is the deep-research prompt to run manually:

${prompt}

Once you have the analysis, continue with Gemini formatting and ingestion as usual.`

  await resend.emails.send({
    to,
    from,
    subject,
    html,
    text
  })
}

export function parseFormattedJson(rawText) {
  const cleaned = rawText
    .replace(/^```json/g, '')
    .replace(/^```/g, '')
    .replace(/```$/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch (error) {
    throw new Error(`Gemini output is not valid JSON: ${error.message}`)
  }
}

export function validateFormattedAnalysis(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Formatted payload must be a JSON object')
  }

  if (!payload.paper || typeof payload.paper !== 'object') {
    throw new Error('Missing paper object')
  }

  const requiredPaperFields = ['title', 'doiOrId', 'authors', 'venue']
  for (const field of requiredPaperFields) {
    if (!payload.paper[field] || typeof payload.paper[field] !== 'string') {
      throw new Error(`paper.${field} must be a non-empty string`)
    }
  }
  if (!('doi' in payload.paper)) {
    throw new Error('paper.doi must be present (use null when missing)')
  }

  if (!payload.reproducibility || typeof payload.reproducibility !== 'object') {
    throw new Error('Missing reproducibility object')
  }

  if (typeof payload.reproducibility.overallVerdict !== 'string' || !payload.reproducibility.overallVerdict.trim()) {
    throw new Error('reproducibility.overallVerdict must be a non-empty string')
  }

  const snapshot = payload.reproducibility.feasibilitySnapshot
  if (!Array.isArray(snapshot) || snapshot.length < 5 || snapshot.length > 7) {
    throw new Error('reproducibility.feasibilitySnapshot must contain 5-7 entries')
  }
  for (const item of snapshot) {
    if (!item || typeof item !== 'object') {
      throw new Error('Each feasibilitySnapshot entry must be an object')
    }
    if (typeof item.question !== 'string' || !/^(Do you have|Can you|Are you equipped to)/.test(item.question)) {
      throw new Error('Each feasibility question must start with "Do you have", "Can you", or "Are you equipped to"')
    }
    if (typeof item.whyItMatters !== 'string' || !item.whyItMatters.trim()) {
      throw new Error('Each feasibilitySnapshot entry requires whyItMatters text')
    }
  }

  if (!payload.methodFindingCrosswalk || typeof payload.methodFindingCrosswalk !== 'object') {
    throw new Error('Missing methodFindingCrosswalk object')
  }

  const crosswalkPapers = payload.methodFindingCrosswalk.papers
  if (!Array.isArray(crosswalkPapers) || crosswalkPapers.length < 3 || crosswalkPapers.length > 5) {
    throw new Error('methodFindingCrosswalk.papers must contain 3-5 items')
  }

  for (const paper of crosswalkPapers) {
    if (!paper || typeof paper !== 'object') {
      throw new Error('Each crosswalk paper must be an object')
    }
    const requiredFields = ['id', 'title', 'authors', 'venue', 'year', 'clusterLabel', 'summary', 'highlight', 'matrix']
    for (const field of requiredFields) {
      if (!(field in paper)) {
        throw new Error(`Crosswalk paper missing ${field}`)
      }
    }
    if (!CLUSTER_LABELS.has(paper.clusterLabel)) {
      throw new Error(`Invalid clusterLabel: ${paper.clusterLabel}`)
    }
    if (typeof paper.matrix !== 'object' || Array.isArray(paper.matrix)) {
      throw new Error('Each crosswalk paper must include matrix object')
    }
    const matrixFields = [
      'sampleModel',
      'materialsRatios',
      'equipmentSetup',
      'procedureSteps',
      'controls',
      'outputsMetrics',
      'qualityChecks',
      'outcomeSummary'
    ]
    for (const key of matrixFields) {
      if (!(key in paper.matrix)) {
        throw new Error(`Crosswalk matrix missing ${key}`)
      }
    }
    if (!HIGHLIGHT_PATTERNS.some(pattern => pattern.test(paper.highlight))) {
      throw new Error(`Highlight must follow required pattern: ${paper.highlight}`)
    }
  }

  return true
}

export function computePromptFingerprint({ researcherId, prompt }) {
  return crypto.createHash('sha256').update(`${researcherId}::${prompt}`).digest('hex')
}

export async function persistAnalysis({
  supabase,
  researcherId,
  paper,
  prompt,
  perplexityResponse,
  formattedPayload,
  modelVersion = 'perplexity.sonar-deep-research+gemini-2.5',
  status = 'approved'
}) {
  if (!supabase) {
    throw new Error('Supabase client is required to persist analysis')
  }
  const fingerprint = computePromptFingerprint({ researcherId, prompt })
  const authors = Array.isArray(paper.authors) ? paper.authors.join('; ') : (paper.authors || null)

  const insertPayload = {
    researcher_id: researcherId,
    paper_title: paper.title,
    paper_identifier: coalesceIdentifier({ ...paper, doi: formattedPayload?.paper?.doiOrId }),
    paper_authors: authors,
    paper_venue: paper.venue || formattedPayload?.paper?.venue || null,
    paper_doi: formattedPayload?.paper?.doi || paper.doi || null,
    prompt_fingerprint: fingerprint,
    perplexity_prompt: prompt,
    perplexity_response: perplexityResponse,
    gemini_payload: formattedPayload,
    status,
    source: 'perplexity_automation',
    model_version: modelVersion
  }

  const { error } = await supabase
    .from('paper_analyses')
    .upsert(insertPayload, { onConflict: 'researcher_id,prompt_fingerprint' })

  if (error) {
    throw new Error(`Failed to persist paper analysis: ${error.message}`)
  }
}

export function ensureArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }
  return value
}
