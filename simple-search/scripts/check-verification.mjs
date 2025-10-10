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

// First check for exact match
const { data, error } = await supabase
  .from('paper_verification_requests')
  .select('*')
  .eq('paper_lookup_id', paperId)
  .order('created_at', { ascending: false })

// Also check partial match in case there's a typo or formatting difference
const { data: allRecent, error: allError } = await supabase
  .from('paper_verification_requests')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20)

if (error) {
  console.error('Error:', error)
} else if (!data || data.length === 0) {
  console.log('❌ No exact match found for this paper')
  console.log('')
  console.log('Checking for partial matches in recent requests...')

  const partialMatches = allRecent?.filter(r =>
    r.paper_lookup_id?.includes('1ce7f') ||
    r.request_payload?.paper?.title?.toLowerCase().includes('ginkgolide')
  )

  if (partialMatches && partialMatches.length > 0) {
    console.log('\n✓ Found potential matches:')
    partialMatches.forEach(req => {
      console.log(`\nRequest ID: ${req.id}`)
      console.log(`Status: ${req.status}`)
      console.log(`Created: ${req.created_at}`)
      console.log(`Paper Lookup ID: ${req.paper_lookup_id}`)
      console.log(`Paper Title: ${req.request_payload?.paper?.title || 'Not found'}`)
    })
  } else {
    console.log('\n❌ No matches found in recent 20 requests')
    console.log('\nMost recent 5 requests:')
    allRecent?.slice(0, 5).forEach(r => {
      console.log(`- ${r.id}: ${r.request_payload?.paper?.title?.substring(0, 60) || r.paper_lookup_id?.substring(0, 40)}... (${r.status})`)
    })
  }
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
