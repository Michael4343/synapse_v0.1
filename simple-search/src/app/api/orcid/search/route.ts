import { NextRequest, NextResponse } from 'next/server'

const ORCID_API_BASE = 'https://pub.orcid.org/v3.0'
const ORCID_TOKEN_URL = 'https://orcid.org/oauth/token'
const MAX_RESULTS = 20

// Cache token to avoid requesting it for every search
let cachedToken: string | null = null
let tokenExpiry: number = 0

interface OrcidSearchHit {
  'orcid-identifier'?: {
    uri?: string
    path?: string
  }
}

interface OrcidExpandedResult {
  'expanded-result'?: Array<{
    'orcid-id'?: string
    'given-names'?: string
    'family-names'?: string
    'institution-name'?: Array<string>
  }>
}

interface OrcidSearchResponse {
  'num-found'?: number
  result?: OrcidSearchHit[]
  'expanded-result'?: OrcidExpandedResult['expanded-result']
}

/**
 * Get an access token for ORCID Public API
 */
async function getOrcidAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken
  }

  const clientId = process.env.ORCID_CLIENT_ID
  const clientSecret = process.env.ORCID_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('ORCID credentials not configured')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: '/read-public',
  })

  const response = await fetch(ORCID_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error('ORCID token request failed:', response.status, errorText)
    throw new Error(`Failed to get ORCID access token: ${response.status}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  // Token typically expires in 20 years, but we'll cache for 1 hour to be safe
  tokenExpiry = Date.now() + 60 * 60 * 1000

  return cachedToken
}

/**
 * Search ORCID registry by name
 */
async function searchOrcid(firstName: string, lastName: string, accessToken: string) {
  // Build search query: given-names:FirstName AND family-name:LastName
  const query = `given-names:${encodeURIComponent(firstName)} AND family-name:${encodeURIComponent(lastName)}`

  const response = await fetch(
    `${ORCID_API_BASE}/search/?q=${query}&rows=${MAX_RESULTS}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error('ORCID search failed:', response.status, errorText)
    throw new Error(`ORCID search failed: ${response.status}`)
  }

  const data: OrcidSearchResponse = await response.json()
  return data
}

/**
 * Get detailed profile information for an ORCID iD
 */
async function getOrcidProfile(orcidId: string, accessToken: string) {
  const response = await fetch(`${ORCID_API_BASE}/${orcidId}/person`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    console.error(`Failed to fetch ORCID profile for ${orcidId}:`, response.status)
    return null
  }

  return response.json()
}

/**
 * Parse ORCID search results and enrich with profile data
 */
async function parseOrcidResults(
  searchData: OrcidSearchResponse,
  accessToken: string
) {
  const results = searchData.result || []

  if (!results.length) {
    return []
  }

  // Extract ORCID IDs from results
  const orcidIds = results
    .map((hit) => hit['orcid-identifier']?.path)
    .filter((id): id is string => Boolean(id))
    .slice(0, 10) // Limit to first 10 for performance

  // Fetch detailed profiles in parallel
  const profiles = await Promise.all(
    orcidIds.map((orcidId) => getOrcidProfile(orcidId, accessToken))
  )

  // Transform to our format
  return profiles
    .map((profile, index) => {
      if (!profile) return null

      const orcidId = orcidIds[index]
      const name = profile.name || {}
      const givenNames = name['given-names']?.value || ''
      const familyName = name['family-name']?.value || ''
      const fullName = [givenNames, familyName].filter(Boolean).join(' ') || 'Unknown'

      // Extract institution/affiliation
      const employments = profile['employment-summary'] || []
      const firstEmployment = Array.isArray(employments) ? employments[0] : null
      const institution = firstEmployment?.organization?.name || ''

      return {
        orcidId,
        name: fullName,
        givenNames,
        familyName,
        institution,
        affiliation: institution, // Alias for backwards compatibility
      }
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
}

/**
 * GET /api/orcid/search
 * Search ORCID registry by first and last name
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const firstName = searchParams.get('firstName')?.trim()
    const lastName = searchParams.get('lastName')?.trim()

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'Both firstName and lastName are required' },
        { status: 400 }
      )
    }

    // Get access token
    const accessToken = await getOrcidAccessToken()

    // Search ORCID
    const searchData = await searchOrcid(firstName, lastName, accessToken)

    // Parse and enrich results
    const results = await parseOrcidResults(searchData, accessToken)

    return NextResponse.json({
      results,
      totalResults: searchData['num-found'] || 0,
    })
  } catch (error) {
    console.error('ORCID search API error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Check for configuration errors
    if (errorMessage.includes('not configured')) {
      return NextResponse.json(
        { error: 'ORCID integration is not configured. Please add ORCID credentials to environment variables.' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to search ORCID registry. Please try again later.' },
      { status: 500 }
    )
  }
}
