#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { stdin, stdout, exit } from 'node:process'
import readline from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }

    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[verification-complete] Missing supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.')
  exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

const rl = readline.createInterface({ input: stdin, output: stdout })

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled']

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

async function selectRequest(requests) {
  console.log('\nOpen verification requests:')
  requests.forEach((request, index) => {
    const paperRef = request.paper_id ? `paper ${request.paper_id}` : `lookup ${request.paper_lookup_id}`
    console.log(`  [${index}] ${request.verification_type.toUpperCase()} • ${paperRef} • status ${request.status} • created ${request.created_at}`)
  })

  const input = (await rl.question('\nSelect a request by number or paste a request UUID: ')).trim()
  if (!input) {
    return null
  }

  const index = Number.parseInt(input, 10)
  if (!Number.isNaN(index) && index >= 0 && index < requests.length) {
    return requests[index]
  }

  const match = requests.find((request) => request.id === input)
  if (match) {
    return match
  }

  console.error('No request matched that selection.')
  return null
}

async function promptForStatus(defaultStatus) {
  const input = (await rl.question(`Set status [${defaultStatus}]: `)).trim()
  if (!input) {
    return defaultStatus
  }
  if (!VALID_STATUSES.includes(input)) {
    console.error(`Invalid status. Use one of: ${VALID_STATUSES.join(', ')}`)
    return promptForStatus(defaultStatus)
  }
  return input
}

async function promptForReport() {
  const input = (await rl.question('Path to JSON analysis (leave blank to skip): ')).trim()
  if (!input) {
    return null
  }
  const resolvedPath = path.resolve(input)
  if (!fs.existsSync(resolvedPath)) {
    console.error('File not found. Please try again.')
    return promptForReport()
  }
  const raw = fs.readFileSync(resolvedPath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.error('Could not parse JSON file:', error.message)
    return promptForReport()
  }
}

async function main() {
  const { data: requests, error } = await supabase
    .from('paper_verification_requests')
    .select(
      'id, paper_id, paper_lookup_id, user_id, verification_type, status, created_at, updated_at, completed_at, request_payload, result_summary'
    )
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to load verification requests:', error.message)
    exit(1)
  }

  if (!requests || requests.length === 0) {
    console.log('No pending verification requests found.')
    exit(0)
  }

  const selected = await selectRequest(requests)
  if (!selected) {
    console.log('No request selected. Exiting.')
    exit(0)
  }

  const candidateIds = []
  if (selected.paper_id) {
    candidateIds.push({ id: selected.paper_id, source: 'paper_id' })
  }
  if (selected.paper_lookup_id && (!selected.paper_id || selected.paper_lookup_id !== selected.paper_id)) {
    candidateIds.push({ id: selected.paper_lookup_id, source: 'paper_lookup_id' })
  }

  let paperForUpdateId = null
  let paperMetadata = null
  let metadataSource = null

  for (const candidate of candidateIds) {
    if (!isUuid(candidate.id)) {
      continue
    }

    const { data, error: candidateError } = await supabase
      .from('search_results')
      .select('id, title, doi, url')
      .eq('id', candidate.id)
      .maybeSingle()

    if (candidateError) {
      console.error(`Failed to load paper metadata for ${candidate.id}:`, candidateError.message)
      continue
    }

    if (data) {
      paperForUpdateId = data.id
      paperMetadata = data
      metadataSource = candidate.source
      break
    }
  }

  if (paperMetadata) {
    console.log(`\nPaper: ${paperMetadata.title}`)
    if (paperMetadata.doi) {
      console.log(`DOI: ${paperMetadata.doi}`)
    }
    if (paperMetadata.url) {
      console.log(`URL: ${paperMetadata.url}`)
    }
    if (metadataSource && metadataSource !== 'paper_id') {
      console.log(`(Resolved via ${metadataSource})`)
    }
  } else {
    if (!candidateIds.some((candidate) => isUuid(candidate.id))) {
      console.log('\nNo matching search_results record (paper reference is an external lookup).')
    } else {
      console.warn('\nWarning: Could not resolve paper metadata in search_results.')
    }
  }

  const nextStatus = await promptForStatus('completed')
  const reportData = await promptForReport()
  const now = new Date().toISOString()

  const updatePayload = {
    status: nextStatus,
    updated_at: now,
    completed_at: nextStatus === 'completed' ? now : null
  }

  if (reportData !== null) {
    updatePayload.result_summary = reportData
  }

  const { error: updateError } = await supabase
    .from('paper_verification_requests')
    .update(updatePayload)
    .eq('id', selected.id)

  if (updateError) {
    console.error('Failed to update verification request:', updateError.message)
    exit(1)
  }

  const searchUpdate = {}

  const applyClaimsUpdate = () => {
    searchUpdate.claims_status = nextStatus
    if (reportData !== null) {
      searchUpdate.claims_verified = reportData
    }
  }

  const applyReproUpdate = () => {
    searchUpdate.reproducibility_status = nextStatus
    if (reportData !== null) {
      searchUpdate.reproducibility_data = reportData
    }
  }

  switch (selected.verification_type) {
    case 'claims':
      applyClaimsUpdate()
      break
    case 'reproducibility':
      applyReproUpdate()
      break
    case 'combined':
      applyClaimsUpdate()
      applyReproUpdate()
      break
    default:
      break
  }

  if (Object.keys(searchUpdate).length > 0 && paperForUpdateId) {
    const { error: searchError } = await supabase
      .from('search_results')
      .update(searchUpdate)
      .eq('id', paperForUpdateId)

    if (searchError) {
      console.error('Failed to update paper record:', searchError.message)
      exit(1)
    }
  } else if (Object.keys(searchUpdate).length > 0 && !paperForUpdateId) {
    console.warn('Skipped search_results update because no matching record was found for this request.')
  }

  console.log(
    `\n✔ Updated ${selected.verification_type} request ${selected.id} to status "${nextStatus}".`
  )
  if (paperForUpdateId && Object.keys(searchUpdate).length > 0) {
    console.log(`✔ Applied verification data to search_results record ${paperForUpdateId}.`)
  }
  if (reportData !== null) {
    console.log('✔ Attached analysis payload to verification request record.')
  }
}

main()
  .catch((error) => {
    console.error('Unexpected error:', error)
    exit(1)
  })
  .finally(() => {
    rl.close()
  })
