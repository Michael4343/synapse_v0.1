#!/usr/bin/env node

import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import {
  loadEnvFiles,
  getSupabaseAdminClient,
  fetchActiveResearchers,
  parseFormattedJson,
  validateFormattedAnalysis,
  persistAnalysis
} from './lib/deep-research.mjs'

function parseArgs(argv) {
  return {
    researcherId: argv.find(arg => arg.startsWith('--researcher='))?.split('=')[1] || null,
    modelVersion: argv.find(arg => arg.startsWith('--model='))?.split('=')[1] || 'manual.gemini-2.5'
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

async function readMultiline(rl, label) {
  console.log(`\nPaste the ${label}. Type END on its own line to finish input:`)
  const lines = []
  while (true) {
    const line = await rl.question('')
    if (line.trim() === 'END') {
      break
    }
    lines.push(line)
  }
  const text = lines.join('\n').trim()
  if (!text) {
    throw new Error(`No ${label.toLowerCase()} provided`)
  }
  return text
}

function derivePaperFromPayload(payload) {
  const paper = payload?.paper || {}
  const authors = typeof paper.authors === 'string'
    ? [paper.authors]
    : Array.isArray(paper.authors)
      ? paper.authors
      : []

  return {
    title: paper.title || 'Untitled paper',
    authors,
    venue: paper.venue || null,
    doi: paper.doi || null,
    url: null,
    abstract: null
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv)
    await loadEnvFiles()

    const supabase = getSupabaseAdminClient()
    const researchers = await fetchActiveResearchers(supabase)

    const rl = readline.createInterface({ input, output })

    try {
      const researcher = await selectResearcher(rl, researchers, args.researcherId)
      console.log(`\nSelected researcher: ${researcher.display_name}`)

      const promptText = await readMultiline(rl, 'Perplexity prompt')
      const perplexityResponse = await readMultiline(rl, 'Perplexity response')
      const geminiRaw = await readMultiline(rl, 'Gemini JSON payload')

      const formattedJson = parseFormattedJson(geminiRaw)
      validateFormattedAnalysis(formattedJson)
      const paper = derivePaperFromPayload(formattedJson)

      await persistAnalysis({
        supabase,
        researcherId: researcher.id,
        paper,
        prompt: promptText,
        perplexityResponse,
        formattedPayload: formattedJson,
        modelVersion: args.modelVersion
      })

      console.log('\n✅ Analysis saved successfully.')
    } finally {
      rl.close()
    }
  } catch (error) {
    console.error(`\n❌ ${error.message}`)
    process.exit(1)
  }
}

main()
