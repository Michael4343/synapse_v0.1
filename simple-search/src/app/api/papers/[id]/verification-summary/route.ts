import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

interface VerificationSummaryResponse {
  requests: Array<{
    id: string
    paper_id: string | null
    paper_lookup_id: string
    user_id: string | null
    verification_type: 'claims' | 'reproducibility' | 'combined'
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    created_at: string
    updated_at: string
    completed_at: string | null
    result_summary: unknown
    request_payload: unknown
  }>
  reproducibilityReport: unknown
  claimsReport: unknown
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    if (id.startsWith('sample-')) {
      const payload: VerificationSummaryResponse = {
        requests: [],
        reproducibilityReport: null,
        claimsReport: null
      }
      return NextResponse.json(payload)
    }

    const { data: requestsData, error: requestsError } = await supabaseAdmin
      .from(TABLES.VERIFICATION_REQUESTS)
      .select('id, paper_id, paper_lookup_id, user_id, verification_type, status, created_at, updated_at, completed_at, result_summary, request_payload')
      .eq('paper_lookup_id', id)
      .order('created_at', { ascending: false })

    if (requestsError) {
      console.error('Failed to load verification requests:', requestsError)
      return NextResponse.json({ error: 'Unable to load verification requests' }, { status: 500 })
    }

    let paperData: { reproducibility_data: unknown; claims_verified: unknown } | null = null
    if (isUuid(id)) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.SEARCH_RESULTS)
        .select('reproducibility_data, claims_verified')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        console.error('Failed to load paper verification data:', error)
        return NextResponse.json({ error: 'Unable to load verification data' }, { status: 500 })
      }

      paperData = data
    }

    const fallbackReport = requestsData?.find((request) => request.result_summary)?.result_summary ?? null

    const payload: VerificationSummaryResponse = {
      requests: requestsData ?? [],
      reproducibilityReport: paperData?.reproducibility_data ?? fallbackReport ?? null,
      claimsReport: paperData?.claims_verified ?? fallbackReport ?? null
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Unexpected error in verification summary API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
