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

const paperId = '1ce7f2291a7ca086a788219e391ec79251db2050'

console.log('Looking for verification requests with paper_lookup_id:', paperId)
console.log('')

const { data, error } = await supabase
  .from('paper_verification_requests')
  .select('*')
  .eq('paper_lookup_id', paperId)
  .order('created_at', { ascending: false })

if (error) {
  console.error('Error:', error)
} else if (!data || data.length === 0) {
  console.log('❌ No verification requests found for this paper')
  console.log('')
  console.log('Checking recent requests...')

  const { data: recent } = await supabase
    .from('paper_verification_requests')
    .select('id, paper_id, paper_lookup_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  console.log('\nRecent requests:')
  recent?.forEach(r => {
    console.log(`- ${r.id}: paper_lookup_id=${r.paper_lookup_id?.substring(0, 40)}... status=${r.status}`)
  })
} else {
  console.log(`✓ Found ${data.length} request(s):`)
  data.forEach(req => {
    console.log(`\nRequest ID: ${req.id}`)
    console.log(`Status: ${req.status}`)
    console.log(`Created: ${req.created_at}`)
    console.log(`User ID: ${req.user_id}`)
    console.log(`Paper ID: ${req.paper_id || 'null'}`)
    console.log(`Paper Lookup ID: ${req.paper_lookup_id}`)
    console.log(`Verification Type: ${req.verification_type}`)
  })
}
