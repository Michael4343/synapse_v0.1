import { NextRequest, NextResponse } from 'next/server'
import { createClient, supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

interface VerificationRequestRecord {
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
}

interface CommunityReviewRequestRecord {
  id: string
  paper_id: string | null
  paper_lookup_id: string
  user_id: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  request_payload: unknown
  created_at: string
  updated_at: string
}

interface VerificationSummaryResponse {
  requests: VerificationRequestRecord[]
  communityReviewRequests: CommunityReviewRequestRecord[]
  reproducibilityReport: unknown
  claimsReport: unknown
}

function isVerificationRequestRecord(value: unknown): value is VerificationRequestRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<VerificationRequestRecord>
  return typeof record.id === 'string' && typeof record.paper_lookup_id === 'string'
}

function isCommunityReviewRecord(value: unknown): value is CommunityReviewRequestRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<CommunityReviewRequestRecord>
  return typeof record.id === 'string' && typeof record.paper_lookup_id === 'string'
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
        communityReviewRequests: [],
        reproducibilityReport: null,
        claimsReport: null
      }
      return NextResponse.json(payload)
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: requestsData, error: requestsError } = await supabaseAdmin
      .from(TABLES.VERIFICATION_REQUESTS)
      .select('id, paper_id, paper_lookup_id, user_id, verification_type, status, created_at, updated_at, completed_at, result_summary, request_payload')
      .eq('paper_lookup_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (requestsError) {
      console.error('Failed to load verification requests:', requestsError)
      return NextResponse.json({ error: 'Unable to load verification requests' }, { status: 500 })
    }

    const { data: communityReviewData, error: communityReviewError } = await supabaseAdmin
      .from(TABLES.COMMUNITY_REVIEW_REQUESTS)
      .select('id, paper_id, paper_lookup_id, user_id, status, request_payload, created_at, updated_at')
      .eq('paper_lookup_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (communityReviewError) {
      console.error('Failed to load community review requests:', communityReviewError)
      return NextResponse.json({ error: 'Unable to load community review requests' }, { status: 500 })
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

    const verifiedRequests = Array.isArray(requestsData)
      ? requestsData.filter(isVerificationRequestRecord)
      : []

    const communityRequests = Array.isArray(communityReviewData)
      ? communityReviewData.filter(isCommunityReviewRecord)
      : []

    const fallbackReport = verifiedRequests.find((request) => request.result_summary)?.result_summary ?? null

    const payload: VerificationSummaryResponse = {
      requests: verifiedRequests,
      communityReviewRequests: communityRequests,
      reproducibilityReport: paperData?.reproducibility_data ?? fallbackReport ?? null,
      claimsReport: paperData?.claims_verified ?? fallbackReport ?? null
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Unexpected error in verification summary API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
