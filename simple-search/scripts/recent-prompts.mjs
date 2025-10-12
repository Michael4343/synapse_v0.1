#!/usr/bin/env node

import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import clipboardy from 'clipboardy'

import {
  loadEnvFiles,
  getSupabaseAdminClient,
  fetchActiveResearchers,
  buildPerplexityPrompt
} from './lib/deep-research.mjs'

function parseArgs(argv) {
  return {
    copy: argv.includes('--copy'),
    researcherId: argv.find(arg => arg.startsWith('--researcher='))?.split('=')[1] || null
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

async function readPaperContext(rl) {
  console.log('\nPaste the JSON payload for the target paper (object or array). Type END on its own line to finish input:')

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

  const items = Array.isArray(parsed) ? parsed : [parsed]
  if (!items.length) {
    throw new Error('Payload must include at least one paper object')
  }

  return items
}

function normalisePaper(raw) {
  return {
    title: raw.title || 'Untitled paper',
    authors: Array.isArray(raw.authors)
      ? raw.authors
      : typeof raw.authors === 'string'
        ? raw.authors.split(/,|;/).map(part => part.trim()).filter(Boolean)
        : [],
    venue: raw.venue || raw.journal || raw.publicationVenue || null,
    year: raw.year || raw.publicationYear || null,
    doi: raw.doi || raw.DOI || null,
    arxivId: raw.arxivId || raw.arxiv_id || null,
    url: raw.url || raw.link || null,
    abstract: raw.abstract || raw.summary || null
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

      const papersRaw = await readPaperContext(rl)
      const prompts = []

      for (const raw of papersRaw) {
        const paper = normalisePaper(raw)
        const prompt = await buildPerplexityPrompt({ paper, researcher })
        prompts.push({ paper, prompt })
      }

      prompts.forEach(({ paper, prompt }, index) => {
        console.log(`\n===== Prompt ${index + 1}: ${paper.title} =====`)
        console.log(prompt)
        console.log('===== End Prompt =====\n')
      })

      if (args.copy && prompts.length) {
        await clipboardy.write(prompts[0].prompt)
        console.log('📋 First prompt copied to clipboard.')
      }
    } finally {
      rl.close()
    }

    console.log('\n✅ Prompt generation complete.')
  } catch (error) {
    console.error(`\n❌ ${error.message}`)
    process.exit(1)
  }
}

main()
