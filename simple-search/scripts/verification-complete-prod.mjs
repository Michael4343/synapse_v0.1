#!/usr/bin/env node

import fs from 'node:fs'
import { stdin, stdout, exit } from 'node:process'
import readline from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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

function resolveEnvFileOverride(args) {
  let envFile

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (typeof arg !== 'string') {
      continue
    }

    if (arg === '--env-file' && index + 1 < args.length) {
      envFile = args[index + 1]
      break
    }

    if (arg.startsWith('--env-file=')) {
      envFile = arg.slice('--env-file='.length)
      break
    }
  }

  return envFile || process.env.VERIFICATION_ENV_FILE || process.env.SUPABASE_ENV_FILE || null
}

const envFileOverride = resolveEnvFileOverride(process.argv.slice(2))

if (envFileOverride) {
  loadEnvFile(envFileOverride)
}

loadEnvFile('.env.production')
loadEnvFile('.env')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || null
const RESEARCH_FEED_URL = process.env.RESEARCH_FEED_URL || 'https://research.evidentia.bio/'

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

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

function sanitiseSummary(summary) {
  if (summary === undefined || summary === null) {
    return 'Summary not provided.'
  }

  if (typeof summary === 'string') {
    return summary
  }

  try {
    return JSON.stringify(summary, null, 2)
  } catch (error) {
    return String(summary)
  }
}

function resolveRecipientEmail(request) {
  return request.user_email || request.request_payload?.user?.email || null
}

async function sendCompletionEmail({ request, paperTitle, reportData }) {
  if (!resendClient) {
    return { sent: false, reason: 'Resend is not configured (missing RESEND_API_KEY).' }
  }

  if (!RESEND_FROM_EMAIL) {
    return { sent: false, reason: 'RESEND_FROM_EMAIL is not set.' }
  }

  const recipient = resolveRecipientEmail(request)
  if (!recipient) {
    return { sent: false, reason: 'Could not determine recipient email for this request.' }
  }

  const verificationLabel = request.verification_type ? request.verification_type.replace('_', ' ') : 'verification'
  const paperDisplayTitle = paperTitle || request.paper_title || request.paper_lookup_id || 'your paper'
  const reproducibility = reportData?.reproducibility || null
  const crosswalkPapers = reportData?.methodFindingCrosswalk?.papers || []

  const summaryLines = []
  if (reproducibility?.overallVerdict) {
    summaryLines.push(`Overall verdict: ${reproducibility.overallVerdict}`)
  }

  if (Array.isArray(reproducibility?.feasibilitySnapshot) && reproducibility.feasibilitySnapshot.length > 0) {
    summaryLines.push('Top capability checks:')
    reproducibility.feasibilitySnapshot.slice(0, 3).forEach((item) => {
      if (item?.question) {
        summaryLines.push(`- ${item.question}`)
      }
    })
  }

  if (Array.isArray(crosswalkPapers) && crosswalkPapers.length > 0) {
    summaryLines.push('Similar papers added:')
    crosswalkPapers.slice(0, 3).forEach((paper) => {
      if (paper?.title) {
        const venue = paper.venue ? `, ${paper.venue}` : ''
        const year = paper.year ? ` ${paper.year}` : ''
        summaryLines.push(`- ${paper.title}${venue}${year}`)
      }
    })
  }

  const jsonDump = sanitiseSummary(reportData)
  const summaryBody = summaryLines.length > 0
    ? `${summaryLines.join('\n')}\n\nFull payload:\n${jsonDump}`
    : jsonDump

  const stageLabel = 'completed'
  const updatedAt = new Date().toISOString()

  const textLines = [
    'Hi there,',
    '',
    `Your ${verificationLabel} verification request for "${paperDisplayTitle}" is now complete.`,
    '',
    `Stage: ${stageLabel}`,
    `Last updated: ${updatedAt}`,
    '',
    'Summary:',
    summaryBody,
    '',
    `Review the full verification details at ${RESEARCH_FEED_URL}`,
    '',
    '— Evidentia Team'
  ]

  try {
    const response = await resendClient.emails.send({
      from: RESEND_FROM_EMAIL,
      to: recipient,
      subject: `Verification completed for ${paperDisplayTitle}`,
      text: textLines.join('\n')
    })

    if (response?.error) {
      const errorMessage = response.error?.message || 'Unknown Resend API error.'
      return { sent: false, reason: errorMessage }
    }

    return { sent: true, recipient }
  } catch (error) {
    return { sent: false, reason: error?.message || 'Failed to send email notification.' }
  }
}

async function selectRequest(requests) {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  PENDING VERIFICATION REQUESTS')
  console.log('═══════════════════════════════════════════════════════════\n')

  requests.forEach((request, index) => {
    const number = index + 1
    const type = request.verification_type.toUpperCase()
    const paperTitle = request.paper_title || `ID: ${request.paper_id?.substring(0, 8) || request.paper_lookup_id?.substring(0, 40)}...`
    const userDisplay = request.user_email || request.user_id?.substring(0, 8) || 'Unknown user'
    const date = new Date(request.created_at).toLocaleDateString()

    console.log(`  ${number}. ${type} verification`)
    console.log(`     Paper: ${paperTitle}`)
    console.log(`     Requested by: ${userDisplay}`)
    console.log(`     Created: ${date}`)
    console.log('')
  })

  console.log('───────────────────────────────────────────────────────────')
  const input = (await rl.question('Enter request number (1-' + requests.length + '): ')).trim()

  if (!input) {
    return null
  }

  const number = Number.parseInt(input, 10)
  const index = number - 1

  if (!Number.isNaN(number) && index >= 0 && index < requests.length) {
    return requests[index]
  }

  console.error('Invalid number. Please try again.')
  return null
}

async function promptForJsonData() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  PASTE VERIFICATION JSON')
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log('Paste your formatted JSON below, then press Enter twice.\n')

  const lines = []
  while (true) {
    const line = await rl.question('')
    if (line.trim().toLowerCase() === 'cancel') {
      return null
    }
    if (line.trim() === '' && lines.length > 0) {
      break
    }
    if (line.trim() !== '') {
      lines.push(line)
    }
  }

  if (lines.length === 0) {
    console.error('\n❌ No data provided. Please paste JSON and try again.\n')
    return promptForJsonData()
  }

  const raw = lines.join('\n')
  try {
    const parsed = JSON.parse(raw)
    return parsed
  } catch (error) {
    console.error('\n❌ Invalid JSON:', error.message)
    console.error('Please check your formatting and try again.\n')
    return promptForJsonData()
  }
}

function validateVerificationJson(data) {
  const errors = []

  if (!data || typeof data !== 'object') {
    return ['Payload must be a JSON object']
  }

  if (!data.paper || typeof data.paper !== 'object') {
    errors.push('Missing required field: paper')
  } else {
    if (!data.paper.title || typeof data.paper.title !== 'string') {
      errors.push('Missing required field: paper.title')
    }
    if (!data.paper.doiOrId || typeof data.paper.doiOrId !== 'string') {
      errors.push('Missing required field: paper.doiOrId')
    }
    if (!data.paper.authors || typeof data.paper.authors !== 'string') {
      errors.push('Missing required field: paper.authors')
    }
  }

  if (!data.reproducibility || typeof data.reproducibility !== 'object') {
    errors.push('Missing required field: reproducibility')
  } else {
    if (!data.reproducibility.overallVerdict || typeof data.reproducibility.overallVerdict !== 'string') {
      errors.push('Missing required field: reproducibility.overallVerdict')
    }

    if (!Array.isArray(data.reproducibility.feasibilitySnapshot)) {
      errors.push('Missing required field: reproducibility.feasibilitySnapshot (must be array)')
    } else if (data.reproducibility.feasibilitySnapshot.length < 5) {
      errors.push('reproducibility.feasibilitySnapshot should include at least 5 capability checks')
    } else {
      data.reproducibility.feasibilitySnapshot.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`Invalid feasibilitySnapshot item at index ${index}`)
          return
        }
        if (!item.question || typeof item.question !== 'string') {
          errors.push(`Missing question in feasibilitySnapshot index ${index}`)
        }
        if (!item.whyItMatters || typeof item.whyItMatters !== 'string') {
          errors.push(`Missing whyItMatters in feasibilitySnapshot index ${index}`)
        }
      })
    }
  }

  if (!data.methodFindingCrosswalk || typeof data.methodFindingCrosswalk !== 'object') {
    errors.push('Missing required field: methodFindingCrosswalk')
  } else if (!Array.isArray(data.methodFindingCrosswalk.papers) || data.methodFindingCrosswalk.papers.length === 0) {
    errors.push('methodFindingCrosswalk.papers must be a non-empty array')
  } else {
    data.methodFindingCrosswalk.papers.forEach((paper, index) => {
      if (!paper || typeof paper !== 'object') {
        errors.push(`Invalid paper entry at index ${index}`)
        return
      }

      const requiredStringFields = ['id', 'title', 'authors', 'venue', 'year', 'clusterLabel', 'summary', 'highlight']
      requiredStringFields.forEach((field) => {
        if (!paper[field] || typeof paper[field] !== 'string') {
          errors.push(`Missing required field: methodFindingCrosswalk.papers[${index}].${field}`)
        }
      })

      if (!('citationCount' in paper) || (paper.citationCount !== null && typeof paper.citationCount !== 'number')) {
        errors.push(`Invalid citationCount for methodFindingCrosswalk.papers[${index}]`)
      }

      if (!paper.matrix || typeof paper.matrix !== 'object') {
        errors.push(`Missing matrix object for methodFindingCrosswalk.papers[${index}]`)
      } else {
        const requiredMatrixFields = [
          'sampleModel',
          'materialsRatios',
          'equipmentSetup',
          'procedureSteps',
          'controls',
          'outputsMetrics',
          'qualityChecks',
          'outcomeSummary'
        ]
        requiredMatrixFields.forEach((field) => {
          if (!paper.matrix[field] || typeof paper.matrix[field] !== 'string') {
            errors.push(`Missing matrix field: methodFindingCrosswalk.papers[${index}].matrix.${field}`)
          }
        })
      }
    })
  }

  return errors
}

async function main() {
  const { data: rawRequests, error } = await supabase
    .from('paper_verification_requests')
    .select(`
      id,
      paper_id,
      paper_lookup_id,
      user_id,
      verification_type,
      status,
      created_at,
      updated_at,
      completed_at,
      request_payload,
      result_summary,
      search_results!paper_id(title)
    `)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to load verification requests:', error.message)
    exit(1)
  }

  if (!rawRequests || rawRequests.length === 0) {
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  NO PENDING REQUESTS')
    console.log('═══════════════════════════════════════════════════════════\n')
    console.log('All verification requests have been completed.\n')
    exit(0)
  }

  // Fetch user emails from auth.users for all user_ids
  const userIds = [...new Set(rawRequests.map((req) => req.user_id).filter(Boolean))]
  const userEmailMap = new Map()

  if (userIds.length > 0) {
    const { data: users } = await supabase.auth.admin.listUsers()
    if (users?.users) {
      users.users.forEach((user) => {
        if (userIds.includes(user.id)) {
          userEmailMap.set(user.id, user.email)
        }
      })
    }
  }

  // Fetch paper titles for all requests
  const paperTitleMap = new Map()
  for (const req of rawRequests) {
    // First check if title is in the request payload
    if (req.request_payload?.paper?.title) {
      paperTitleMap.set(req.id, req.request_payload.paper.title)
      continue
    }

    // Then try to fetch from database
    const candidateIds = []
    if (req.paper_id) candidateIds.push(req.paper_id)
    if (req.paper_lookup_id && req.paper_lookup_id !== req.paper_id) {
      candidateIds.push(req.paper_lookup_id)
    }

    for (const candidateId of candidateIds) {
      if (!isUuid(candidateId)) continue

      const { data: paper } = await supabase
        .from('search_results')
        .select('id, title')
        .eq('id', candidateId)
        .maybeSingle()

      if (paper?.title) {
        paperTitleMap.set(req.id, paper.title)
        break
      }
    }
  }

  // Flatten joined data for easier access
  const requests = rawRequests.map((req) => ({
    ...req,
    paper_title: paperTitleMap.get(req.id) || req.search_results?.title,
    user_email: userEmailMap.get(req.user_id)
  }))

  const selected = await selectRequest(requests)
  if (!selected) {
    console.log('\nNo request selected. Exiting.\n')
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

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  SELECTED REQUEST')
  console.log('═══════════════════════════════════════════════════════════\n')

  if (paperMetadata) {
    console.log(`Title: ${paperMetadata.title}`)
    if (paperMetadata.doi) {
      console.log(`DOI:   ${paperMetadata.doi}`)
    }
    if (paperMetadata.url) {
      console.log(`URL:   ${paperMetadata.url}`)
    }
  } else {
    if (!candidateIds.some((candidate) => isUuid(candidate.id))) {
      console.log('Paper: External lookup (not yet in database)')
      console.log(`ID:    ${selected.paper_lookup_id.substring(0, 60)}...`)
    } else {
      console.log('⚠️  Warning: Paper not found in database')
    }
  }

  console.log('')

  // Require JSON data input
  const reportData = await promptForJsonData()
  if (reportData === null) {
    console.log('\nCancelled. No changes made.\n')
    exit(0)
  }

  // Validate JSON structure
  const validationErrors = validateVerificationJson(reportData)
  if (validationErrors.length > 0) {
    console.error('\n❌ JSON validation failed:')
    validationErrors.forEach((error) => console.error(`  - ${error}`))
    console.error('\nPlease fix these issues and run the script again.')
    exit(1)
  }

  console.log('✓ JSON validation passed\n')
  console.log('───────────────────────────────────────────────────────────')
  console.log('Saving to database...\n')

  const now = new Date().toISOString()
  const reproducibilityData = reportData.reproducibility ?? null
  const crosswalkData = reportData.methodFindingCrosswalk ?? null
  let allSavesSucceeded = true
  const saveErrors = []

  // Try to update verification request with data
  try {
    const updatePayload = {
      status: 'in_progress', // Set to in_progress first
      updated_at: now,
      result_summary: reproducibilityData,
      similar_papers_data: crosswalkData
    }

    const { error: updateError } = await supabase
      .from('paper_verification_requests')
      .update(updatePayload)
      .eq('id', selected.id)

    if (updateError) {
      throw new Error(`Failed to update verification request: ${updateError.message}`)
    }
    console.log('✓ Saved data to paper_verification_requests')
  } catch (error) {
    allSavesSucceeded = false
    saveErrors.push(error.message)
  }

  // Try to update search_results if paper exists
  const searchUpdate = {}

  if (reproducibilityData && (selected.verification_type === 'reproducibility' || selected.verification_type === 'combined')) {
    searchUpdate.reproducibility_status = 'in_progress'
    searchUpdate.reproducibility_data = reproducibilityData
  }

  if (crosswalkData && selected.verification_type === 'combined') {
    searchUpdate.similar_papers_status = 'in_progress'
    searchUpdate.similar_papers_data = crosswalkData
    searchUpdate.similar_papers_updated_at = now
  }

  if (Object.keys(searchUpdate).length > 0 && paperForUpdateId) {
    try {
      const { error: searchError } = await supabase
        .from('search_results')
        .update(searchUpdate)
        .eq('id', paperForUpdateId)

      if (searchError) {
        throw new Error(`Failed to update search_results: ${searchError.message}`)
      }
      console.log('✓ Saved data to search_results')
    } catch (error) {
      allSavesSucceeded = false
      saveErrors.push(error.message)
    }
  } else if (Object.keys(searchUpdate).length > 0 && !paperForUpdateId) {
    console.log('ℹ Skipped search_results update (no matching record found)')
  }

  // If all saves succeeded, mark as completed
  if (allSavesSucceeded) {
    try {
      const completePayload = {
        status: 'completed',
        completed_at: now,
        updated_at: now
      }

      const { error: completeError } = await supabase
        .from('paper_verification_requests')
        .update(completePayload)
        .eq('id', selected.id)

      if (completeError) {
        throw new Error(`Failed to mark as completed: ${completeError.message}`)
      }

      // Also update search_results status to completed
      if (Object.keys(searchUpdate).length > 0 && paperForUpdateId) {
        const finalSearchUpdate = {}
        if (searchUpdate.reproducibility_status) {
          finalSearchUpdate.reproducibility_status = 'completed'
        }
        if (searchUpdate.similar_papers_status) {
          finalSearchUpdate.similar_papers_status = 'completed'
          finalSearchUpdate.similar_papers_updated_at = now
        }

        const { error: finalSearchError } = await supabase
          .from('search_results')
          .update(finalSearchUpdate)
          .eq('id', paperForUpdateId)

        if (finalSearchError) {
          throw new Error(`Failed to update search_results status to completed: ${finalSearchError.message}`)
        }
      }

      console.log('\n═══════════════════════════════════════════════════════════')
      console.log('  ✅ SUCCESS')
      console.log('═══════════════════════════════════════════════════════════\n')
      console.log(`Verification request marked as COMPLETED`)
      console.log(`Request ID: ${selected.id}\n`)
      if (paperForUpdateId) {
        console.log(`Paper record updated with verification data`)
        console.log(`Paper ID: ${paperForUpdateId}\n`)
      }

      const emailResult = await sendCompletionEmail({
        request: selected,
        paperTitle: selected.paper_title || paperMetadata?.title,
        reportData
      })

      if (emailResult.sent) {
        console.log(`✉️  Notification sent to ${emailResult.recipient}`)
      } else {
        console.log(`⚠️  Email notification not sent: ${emailResult.reason}`)
      }
    } catch (error) {
      console.error('\n═══════════════════════════════════════════════════════════')
      console.error('  ⚠️  PARTIAL SUCCESS')
      console.error('═══════════════════════════════════════════════════════════\n')
      console.error(`Data saved but could not mark as completed: ${error.message}`)
      console.error('Request remains in "in_progress" state.')
      console.error('You can manually update it in Supabase.\n')
    }
  } else {
    console.error('\n═══════════════════════════════════════════════════════════')
    console.error('  ❌ SAVE FAILED')
    console.error('═══════════════════════════════════════════════════════════\n')
    console.error('Could not save verification data:\n')
    saveErrors.forEach((error) => console.error(`  • ${error}`))
    console.error('\nPlease fix the issues above and try again.\n')
    exit(1)
  }
}

main()
  .catch((error) => {
    console.error('\n═══════════════════════════════════════════════════════════')
    console.error('  ❌ UNEXPECTED ERROR')
    console.error('═══════════════════════════════════════════════════════════\n')
    console.error(error.message || error)
    console.error('\nPlease check your database connection and try again.\n')
    exit(1)
  })
  .finally(() => {
    rl.close()
  })
