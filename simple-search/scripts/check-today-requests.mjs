#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load environment variables
const envContent = readFileSync('.env.production', 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) {
    env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '')
  }
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

console.log('Checking verification requests from 2025-10-10...')
console.log('')

const { data, error } = await supabase
  .from('paper_verification_requests')
  .select('*')
  .gte('created_at', '2025-10-10T00:00:00Z')
  .order('created_at', { ascending: false })

if (error) {
  console.error('Error:', error)
} else if (!data || data.length === 0) {
  console.log('❌ No verification requests found from today')
  console.log('')
  console.log('Checking all recent requests to see latest date...')

  const { data: recent } = await supabase
    .from('paper_verification_requests')
    .select('id, paper_lookup_id, status, created_at, request_payload')
    .order('created_at', { ascending: false })
    .limit(10)

  console.log('\nMost recent 10 requests:')
  recent?.forEach(r => {
    const title = r.request_payload?.paper?.title || r.paper_lookup_id?.substring(0, 40)
    console.log(`${r.created_at} | ${title}... | ${r.status}`)
  })
} else {
  console.log(`✓ Found ${data.length} request(s) from today:`)
  data.forEach(req => {
    console.log(`\nRequest ID: ${req.id}`)
    console.log(`Status: ${req.status}`)
    console.log(`Created: ${req.created_at}`)
    console.log(`Paper Lookup ID: ${req.paper_lookup_id}`)
    console.log(`Paper Title: ${req.request_payload?.paper?.title || 'Not found'}`)
    console.log(`User: ${req.user_id}`)
  })
}
