import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

import { fetchOrcidWorks, generateProfilePersonalization } from '../../../../lib/profile-enrichment'
import { DEFAULT_PROFILE_PERSONALIZATION, ProfilePersonalization } from '../../../../lib/profile-types'

interface EnrichProfileRequestBody {
  manualKeywords?: string[]
  resumeText?: string
  force?: boolean
  source?: string
  skipOrcidFetch?: boolean
}

function sanitiseKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .slice(0, 20)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: EnrichProfileRequestBody
  try {
    body = await request.json()
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const manualKeywords = sanitiseKeywords(body.manualKeywords)
  const resumeText = typeof body.resumeText === 'string' ? body.resumeText : undefined
  const skipOrcidFetch = Boolean(body.skipOrcidFetch)
  const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'manual_refresh'

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('orcid_id, academic_website, profile_personalization, last_profile_enriched_at, profile_enrichment_version')
    .eq('id', user.id)
    .single<{
      orcid_id: string | null
      academic_website: string | null
      profile_personalization: ProfilePersonalization | null
      last_profile_enriched_at: string | null
      profile_enrichment_version: string | null
    }>()

  if (profileError) {
    console.error('Failed to load profile for enrichment', profileError)
    return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 })
  }

  if (!body.force && profile?.last_profile_enriched_at) {
    const lastRun = new Date(profile.last_profile_enriched_at).getTime()
    const hoursSinceLastRun = (Date.now() - lastRun) / (1000 * 60 * 60)
    if (hoursSinceLastRun < 12) {
      return NextResponse.json({
        personalization: profile.profile_personalization ?? DEFAULT_PROFILE_PERSONALIZATION,
        skipped: true,
        reason: 'Enrichment was run recently',
        last_profile_enriched_at: profile.last_profile_enriched_at,
        profile_enrichment_version: profile.profile_enrichment_version,
      })
    }
  }

  const nowIso = new Date().toISOString()
  const jobPayload = {
    manualKeywords,
    hasResumeText: Boolean(resumeText),
    hasOrcidId: Boolean(profile?.orcid_id),
    source,
  }

  const { data: job, error: jobInsertError } = await supabase
    .from('profile_enrichment_jobs')
    .insert({
      user_id: user.id,
      status: 'processing',
      source,
      payload: jobPayload,
      started_at: nowIso,
    })
    .select('id')
    .single()

  if (jobInsertError) {
    console.error('Failed to create profile enrichment job record', jobInsertError)
    return NextResponse.json({ error: 'Unable to schedule profile enrichment' }, { status: 500 })
  }

  try {
    const orcidWorks = !skipOrcidFetch && profile?.orcid_id ? await fetchOrcidWorks(profile.orcid_id) : []

    const enrichment = await generateProfilePersonalization({
      manualKeywords,
      resumeText,
      orcidWorks,
      existingPersonalization: profile?.profile_personalization ?? null,
    })

    const updatePayload = {
      profile_personalization: enrichment.personalization,
      last_profile_enriched_at: new Date().toISOString(),
      profile_enrichment_version: enrichment.modelVersion,
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to persist profile personalization', updateError)
      await supabase
        .from('profile_enrichment_jobs')
        .update({
          status: 'failed',
          error: 'Profile update failed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      return NextResponse.json({ error: 'Unable to save enriched profile' }, { status: 500 })
    }

    await supabase
      .from('profile_enrichment_jobs')
      .update({
        status: 'succeeded',
        result: {
          topicClusterCount: enrichment.personalization.topic_clusters.length,
          authorFocusCount: enrichment.personalization.author_focus.length,
          venueFocusCount: enrichment.personalization.venue_focus.length,
          usedFallback: enrichment.usedFallback,
          modelVersion: enrichment.modelVersion,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({
      personalization: enrichment.personalization,
      usedFallback: enrichment.usedFallback,
      message: enrichment.message,
      last_profile_enriched_at: updatePayload.last_profile_enriched_at,
      profile_enrichment_version: enrichment.modelVersion,
    })
  } catch (error) {
    console.error('Profile enrichment failed', error)

    await supabase
      .from('profile_enrichment_jobs')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown failure',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({ error: 'Profile enrichment failed' }, { status: 500 })
  }
}
