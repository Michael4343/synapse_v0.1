#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const DEFAULT_BASE_URL = 'http://localhost:3000'

function loadEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename)
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

function ensureEnv() {
  loadEnvFile('.env')
  loadEnvFile('.env.local')

  const missing = []
  if (!process.env.CRON_SECRET) {
    missing.push('CRON_SECRET')
  }

  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    process.env.NEXT_PUBLIC_SITE_URL = DEFAULT_BASE_URL
  }

  // Supabase keys are needed for the API route to work locally.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }

  if (missing.length) {
    console.error('Missing required environment variables:', missing.join(', '))
    process.exit(1)
  }
}

async function run() {
  ensureEnv()

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_BASE_URL
  const endpoint = new URL('/api/cron/daily-digest', baseUrl)

  console.log(`Requesting ${endpoint.toString()}`)

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  })

  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    console.error('Response is not valid JSON. Raw body:')
    console.error(text)
    process.exit(response.ok ? 0 : 1)
  }

  console.log(JSON.stringify(parsed, null, 2))

  if (!response.ok) {
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('Digest test failed:', error)
  process.exit(1)
})

