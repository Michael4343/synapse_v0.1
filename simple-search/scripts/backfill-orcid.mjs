#!/usr/bin/env node

/**
 * Interactive ORCID Backfill Script
 *
 * Finds users without ORCID IDs and helps backfill:
 * 1. Shows users missing ORCID
 * 2. Prompts for ORCID ID
 * 3. Uses existing Gemini LLM to extract keywords
 * 4. Lets you select 3 keywords
 * 5. Updates profile in database
 */

import { createClient } from '@supabase/supabase-js'
import readline from 'readline'
import { readFileSync } from 'fs'

// Load environment variables from .env.local
const envFile = readFileSync('.env.local', 'utf-8')
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) {
    const key = match[1].trim()
    const value = match[2].trim()
    process.env[key] = value
  }
})

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const prompt = (question) => new Promise((resolve) => rl.question(question, resolve))

/**
 * Format ORCID ID with dashes
 */
function formatOrcidId(orcid) {
  const cleaned = orcid.replace(/[^0-9X]/gi, '')
  if (cleaned.length !== 16) return orcid
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`
}

/**
 * Fetch ORCID works from public API
 */
async function fetchOrcidWorks(orcidId) {
  const formattedOrcidId = formatOrcidId(orcidId)
  const url = `https://pub.orcid.org/v3.0/${encodeURIComponent(formattedOrcidId)}/works`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('ORCID ID not found')
      }
      throw new Error(`ORCID API error: ${response.status}`)
    }

    const payload = await response.json()
    const groups = Array.isArray(payload?.group) ? payload.group : []
    const works = []

    for (const group of groups) {
      const summaries = Array.isArray(group['work-summary']) ? group['work-summary'] : []
      for (const summary of summaries) {
        works.push({
          title: summary?.title?.title?.value,
          journal: summary?.['journal-title']?.value,
          year: parseInt(summary?.['publication-date']?.year?.value, 10) || undefined,
        })
      }
    }

    return works
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('ORCID request timed out')
    }
    throw error
  }
}

/**
 * Generate keywords using Gemini LLM (existing prompt)
 */
async function generateKeywords(orcidWorks) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const worksSummary = orcidWorks.slice(0, 20).map((work, index) => ({
    index: index + 1,
    title: work.title,
    journal: work.journal,
    year: work.year,
  }))

  const userContext = {
    manualKeywords: [],
    works: worksSummary,
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.PROFILE_ENRICHMENT_MODEL || 'gemini-2.5-flash',
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'profile_personalization',
          schema: {
            type: 'object',
            properties: {
              topic_clusters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    keywords: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 1,
                    },
                  },
                  required: ['label', 'keywords'],
                },
                minItems: 3,
                maxItems: 8,
              },
            },
            required: ['topic_clusters'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing academic research patterns and extracting precise keywords for scientific literature discovery. Focus on identifying the most distinctive research concepts, methodologies, and application domains that would effectively find relevant papers in academic databases. Prioritize specific technical terms over generic academic language.',
        },
        {
          role: 'user',
          content: `Analyze the researcher's publications below and create a personalization profile. Focus on their most distinctive research areas and methodologies. Extract specific technical keywords that would find similar cutting-edge papers, not generic terms like "analysis" or "research". Group related concepts into topic clusters. Respond with JSON only.\n\nResearcher Data:\n${JSON.stringify(userContext).slice(0, 12000)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const message = payload?.choices?.[0]?.message?.content

  if (!message) {
    throw new Error('Gemini response missing content')
  }

  const result = JSON.parse(message)
  const clusters = result.topic_clusters || []

  // Extract all keywords from clusters
  const allKeywords = []
  for (const cluster of clusters) {
    if (Array.isArray(cluster.keywords)) {
      allKeywords.push(...cluster.keywords)
    }
  }

  return allKeywords.filter(Boolean).slice(0, 10) // Return top 10
}

/**
 * Main backfill function
 */
async function backfillOrcid() {
  console.log('🔍 Finding users without ORCID IDs...\n')

  // Query users without ORCID (join with auth.users for email)
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(`
      id,
      orcid_id,
      profile_personalization
    `)
    .or('orcid_id.is.null,orcid_id.eq.')

  if (error) {
    console.error('❌ Error fetching profiles:', error)
    rl.close()
    return
  }

  if (!profiles || profiles.length === 0) {
    console.log('✅ All users have ORCID IDs!')
    rl.close()
    return
  }

  console.log(`Found ${profiles.length} users without ORCID IDs:\n`)

  // Get emails from auth.users for each profile
  for (const [index, profile] of profiles.entries()) {
    // Fetch user email from auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
    const email = authUser?.user?.email || 'N/A'

    // Extract current keywords from profile_personalization
    const personalization = profile.profile_personalization || {}
    const topicClusters = personalization.topic_clusters || []
    const currentKeywords = topicClusters
      .flatMap(cluster => cluster.keywords || [])
      .join(', ') || 'None'

    console.log(`\n${'='.repeat(60)}`)
    console.log(`👤 User ${index + 1}/${profiles.length}`)
    console.log(`User ID: ${profile.id}`)
    console.log(`Email: ${email}`)
    console.log(`Current keywords: ${currentKeywords}`)
    console.log('='.repeat(60))

    // Prompt for ORCID ID
    const orcidInput = await prompt('\nEnter ORCID ID (or "skip" to skip this user): ')

    if (orcidInput.trim().toLowerCase() === 'skip') {
      console.log('⏭️  Skipped')
      continue
    }

    const orcidId = formatOrcidId(orcidInput.trim())
    console.log(`\n📋 Formatted ORCID: ${orcidId}`)

    try {
      // Fetch ORCID works
      console.log('📚 Fetching publications from ORCID...')
      const works = await fetchOrcidWorks(orcidId)
      console.log(`✓ Found ${works.length} publications`)

      if (works.length === 0) {
        console.log('⚠️  No publications found. Save ORCID ID anyway? (yes/no)')
        const saveAnyway = await prompt('> ')
        if (saveAnyway.trim().toLowerCase() === 'yes') {
          await supabase
            .from('profiles')
            .update({ orcid_id: orcidId })
            .eq('id', profile.id)
          console.log('✅ ORCID ID saved')
        }
        continue
      }

      // Generate keywords using Gemini
      console.log('🤖 Generating keywords with Gemini LLM...')
      const keywords = await generateKeywords(works)

      console.log('\n📌 Generated keywords:')
      keywords.forEach((keyword, i) => {
        console.log(`  ${i + 1}. ${keyword}`)
      })

      // Prompt for keyword selection
      console.log('\nEnter 3 keyword numbers to save (e.g., "1,2,5"):')
      const selection = await prompt('> ')

      const selectedIndices = selection
        .split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(i => i >= 0 && i < keywords.length)
        .slice(0, 3)

      if (selectedIndices.length === 0) {
        console.log('❌ No valid keywords selected. Skipping...')
        continue
      }

      const selectedKeywords = selectedIndices.map(i => keywords[i])
      console.log(`\n✓ Selected keywords: ${selectedKeywords.join(', ')}`)

      // Build updated profile_personalization with keywords as topic_clusters
      const updatedPersonalization = {
        ...profile.profile_personalization,
        topic_clusters: selectedKeywords.map((keyword, index) => ({
          id: `manual-${index + 1}`,
          label: keyword,
          keywords: [keyword],
          priority: index + 1,
          source: 'manual'
        })),
        filters: profile.profile_personalization?.filters || {
          recency_days: 1,
          publication_types: ['journal', 'conference', 'preprint'],
          include_preprints: true
        }
      }

      // Update database
      console.log('💾 Saving to database...')
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          orcid_id: orcidId,
          profile_personalization: updatedPersonalization
        })
        .eq('id', profile.id)

      if (updateError) {
        console.error('❌ Error updating profile:', updateError)
      } else {
        console.log('✅ Profile updated successfully!')
      }

    } catch (error) {
      console.error('❌ Error:', error.message)
      console.log('Continuing to next user...')
    }
  }

  console.log('\n✨ Backfill complete!')
  rl.close()
}

// Run the script
backfillOrcid().catch(error => {
  console.error('Fatal error:', error)
  rl.close()
  process.exit(1)
})
