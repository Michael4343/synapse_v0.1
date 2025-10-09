/**
 * ORCID API utilities and types
 */

export interface OrcidSearchResult {
  orcidId: string
  name: string
  givenNames?: string
  familyName?: string
  institution?: string
  affiliation?: string
}

export interface OrcidSearchResponse {
  results: OrcidSearchResult[]
  totalResults: number
}

/**
 * Search ORCID registry by name via our API route
 */
export async function searchOrcidByName(
  firstName: string,
  lastName: string
): Promise<OrcidSearchResponse> {
  const params = new URLSearchParams({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
  })

  const response = await fetch(`/api/orcid/search?${params}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to search ORCID' }))
    throw new Error(error.error || 'Failed to search ORCID registry')
  }

  return response.json()
}

/**
 * Format ORCID ID with dashes (0000-0002-1825-0097)
 */
export function formatOrcidId(orcid: string): string {
  const cleaned = orcid.replace(/[^0-9X]/gi, '')
  if (cleaned.length !== 16) return orcid
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`
}

/**
 * Validate ORCID ID format
 */
export function isValidOrcidFormat(orcid: string): boolean {
  const cleaned = orcid.replace(/[^0-9X]/gi, '')
  return cleaned.length === 16
}

/**
 * Extract display name from ORCID result
 */
export function getOrcidDisplayName(result: OrcidSearchResult): string {
  if (result.name) return result.name
  if (result.givenNames && result.familyName) {
    return `${result.givenNames} ${result.familyName}`
  }
  return 'Unknown'
}
