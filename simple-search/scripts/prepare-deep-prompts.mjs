#!/usr/bin/env node

import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import {
  loadEnvFiles,
  getSupabaseAdminClient,
  fetchActiveResearchers,
  buildPerplexityPrompt,
  callPerplexity,
  stripPerplexityReasoning,
  formatWithGemini,
  parseFormattedJson,
  validateFormattedAnalysis,
  persistAnalysis,
  sendPromptEmail,
  isPerplexityCreditError
} from './lib/deep-research.mjs'

function parseArgs(argv) {
  const flags = new Set()
  const options = {}

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [flag, value] = arg.split('=')
      if (typeof value === 'undefined') {
        flags.add(flag)
      } else {
        options[flag] = value
      }
    }
  }

  return {
    dryRun: flags.has('--dry-run'),
    skipSave: flags.has('--skip-save'),
    researcherId: options['--researcher'] || null
  }
}

async function selectResearcher(rl, researchers, preferredId = null) {
  if (!researchers.length) {
    throw new Error('No active researchers found in Supabase')
  }

  if (preferredId) {
    const match = researchers.find(r => r.id === preferredId)
    if (match) {
      console.log(`Using researcher: ${match.display_name}`)
      return match
    }
    console.warn(`No researcher found with id ${preferredId}; falling back to manual selection.`)
  }

  console.log('\nActive researchers:')
  researchers.forEach((researcher, index) => {
    const keywords = Array.isArray(researcher.research_interests) && researcher.research_interests.length
      ? researcher.research_interests.join(', ')
      : 'No keywords yet'
    console.log(`  [${index + 1}] ${researcher.display_name} <${researcher.contact_email}> — ${keywords}`)
  })

  while (true) {
    const answer = await rl.question('\nSelect researcher number: ')
    const choice = Number.parseInt(answer, 10)
    if (!Number.isNaN(choice) && choice >= 1 && choice <= researchers.length) {
      return researchers[choice - 1]
    }
    console.log('Please enter a valid number from the list above.')
  }
}

async function readPaperPayload(rl) {
  console.log('\nPaste the JSON payload for recent papers (array or object). Type END on its own line to finish input:')

  const lines = []
  while (true) {
    const line = await rl.question('')
    if (line.trim() === 'END') {
      break
    }
    lines.push(line)
  }

  const raw = lines.join('\n').trim()
  if (!raw) {
    throw new Error('No JSON payload provided')
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Unable to parse JSON payload: ${error.message}`)
  }

  if (Array.isArray(parsed)) {
    return parsed
  }

  if (typeof parsed === 'object' && parsed) {
    return [parsed]
  }

  throw new Error('JSON payload must be an object or array of objects')
}

function normalisePaper(raw, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Paper entry ${index + 1} is not a valid object`)
  }

  const authors = Array.isArray(raw.authors)
    ? raw.authors
    : typeof raw.authors === 'string'
      ? raw.authors.split(/,|;/).map(part => part.trim()).filter(Boolean)
      : []

  return {
    title: raw.title || `Untitled paper ${index + 1}`,
    authors,
    venue: raw.venue || raw.journal || raw.publicationVenue || null,
    year: raw.year || raw.publicationYear || null,
    doi: raw.doi || raw.DOI || null,
    arxivId: raw.arxivId || raw.arxiv_id || null,
    url: raw.url || raw.link || null,
    abstract: raw.abstract || raw.summary || null
  }
}

async function processPaper({
  paper,
  researcher,
  supabase,
  dryRun,
  skipSave,
  perplexityKey,
  geminiKey,
  geminiModel
}) {
  console.log(`\n📄 Running deep research for: ${paper.title}`)

  const prompt = await buildPerplexityPrompt({ paper, researcher })

  if (dryRun) {
    console.log('\n--- Perplexity Prompt Preview ---')
    console.log(prompt)
    console.log('--- End Prompt Preview ---\n')
    return
  }

  console.log('🤖 Sending prompt to Perplexity...')
  let perplexityResult
  try {
    perplexityResult = await callPerplexity({ prompt, apiKey: perplexityKey })
    console.log(`   Perplexity completed in ${Math.round(perplexityResult.durationMs)} ms`)
  } catch (error) {
    if (isPerplexityCreditError(error)) {
      console.warn('⚠️  Perplexity credits appear to be exhausted. Reverting to email fallback.')
      try {
        await sendPromptEmail({ researcher, paperTitle: paper.title, prompt })
        console.log('📨 Prompt emailed to researcher for manual deep research execution.')
      } catch (emailError) {
        console.warn(`⚠️  Unable to send email fallback: ${emailError.message}`)
        console.log('\n--- Deep Research Prompt (manual fallback) ---')
        console.log(prompt)
        console.log('--- End Prompt ---\n')
      }
      return
    }
    throw error
  }

  const cleanedAnalysis = stripPerplexityReasoning(perplexityResult.content)

  console.log('🔄 Formatting with Gemini...')
  const geminiRaw = await formatWithGemini({ analysisText: cleanedAnalysis, apiKey: geminiKey, model: geminiModel })

  const formattedJson = parseFormattedJson(geminiRaw)
  validateFormattedAnalysis(formattedJson)

  if (skipSave) {
    console.log('🗂️  Skip-save flag set; not persisting to Supabase.')
    return
  }

  console.log('💾 Saving formatted analysis to Supabase...')
  await persistAnalysis({
    supabase,
    researcherId: researcher.id,
    paper,
    prompt,
    perplexityResponse: perplexityResult.content,
    formattedPayload: formattedJson
  })

  console.log('✅ Analysis stored successfully')
}

async function main() {
  try {
    const args = parseArgs(process.argv)
    await loadEnvFiles()

    const perplexityKey = process.env.PERPLEXITY_API_KEY
    const geminiKey = process.env.GEMINI_API_KEY
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

    if (!perplexityKey && !args.dryRun) {
      throw new Error('PERPLEXITY_API_KEY is missing. Set it in .env.local.')
    }
    if (!geminiKey && !args.dryRun) {
      throw new Error('GEMINI_API_KEY is missing. Set it in .env.local.')
    }

    const supabaseClient = getSupabaseAdminClient()
    const supabaseForPersistence = args.skipSave || args.dryRun ? null : supabaseClient
    const researchers = await fetchActiveResearchers(supabaseClient)

    const rl = readline.createInterface({ input, output })

    try {
      const researcher = await selectResearcher(rl, researchers, args.researcherId)
      console.log(`\nSelected researcher: ${researcher.display_name}`)

      const rawPapers = await readPaperPayload(rl)
      const papers = rawPapers.map((entry, index) => normalisePaper(entry, index))

      for (const paper of papers) {
        await processPaper({
          paper,
          researcher,
          supabase: supabaseForPersistence,
          dryRun: args.dryRun,
          skipSave: args.skipSave || args.dryRun,
          perplexityKey,
          geminiKey,
          geminiModel
        })
      }
    } finally {
      rl.close()
    }

    console.log('\n🎉 Deep research pipeline complete.')
  } catch (error) {
    console.error(`\n❌ ${error.message}`)
    process.exit(1)
  }
}

main()
