const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

export const INTERNAL_ATTRIBUTION_DOMAINS = ['evidentia.bio', 'research.evidentia.bio']

type AttributionResult = {
  current: Record<string, string>
  firstTouch: Record<string, string>
}

function normalizeValue(value: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.toLowerCase()
}

function isInternalDomain(hostname: string | null): boolean {
  if (!hostname) return false
  return INTERNAL_ATTRIBUTION_DOMAINS.some(domain => {
    return hostname === domain || hostname.endsWith(`.${domain}`)
  })
}

function extractReferrer(rawReferrer: string | null): {
  url?: string
  domain?: string
} {
  if (!rawReferrer) return {}

  try {
    const refUrl = new URL(rawReferrer)
    const hostname = refUrl.hostname.toLowerCase()

    if (isInternalDomain(hostname)) {
      return {}
    }

    const domain = hostname.startsWith('www.') ? hostname.slice(4) : hostname
    return {
      url: rawReferrer,
      domain,
    }
  } catch (error) {
    console.warn('Failed to parse referrer url', error)
    return {}
  }
}

export function collectAttribution(): AttributionResult {
  if (typeof window === 'undefined') {
    return { current: {}, firstTouch: {} }
  }

  const current: Record<string, string> = {}
  const firstTouch: Record<string, string> = {}

  let searchParams: URLSearchParams | null = null

  try {
    const url = new URL(window.location.href)
    searchParams = url.searchParams
  } catch (error) {
    console.warn('Failed to parse current url for attribution', error)
  }

  const utmValues: Record<string, string> = {}

  if (searchParams) {
    for (const key of UTM_KEYS) {
      const normalized = normalizeValue(searchParams.get(key))
      if (!normalized) continue

      current[key] = normalized
      utmValues[key] = normalized
    }
  }

  if (utmValues.utm_source) {
    firstTouch.initial_utm_source = utmValues.utm_source
  }
  if (utmValues.utm_medium) {
    firstTouch.initial_utm_medium = utmValues.utm_medium
  }
  if (utmValues.utm_campaign) {
    firstTouch.initial_utm_campaign = utmValues.utm_campaign
  }
  if (utmValues.utm_content) {
    firstTouch.initial_utm_content = utmValues.utm_content
  }
  if (utmValues.utm_term) {
    firstTouch.initial_utm_term = utmValues.utm_term
  }

  const rawReferrer = typeof document !== 'undefined' ? document.referrer || '' : ''
  const { url: referrerUrl, domain: referrerDomain } = extractReferrer(rawReferrer || null)

  if (referrerDomain) {
    current.referring_domain = referrerDomain
    firstTouch.initial_referring_domain = referrerDomain
  } else if (!rawReferrer && !utmValues.utm_source && !utmValues.utm_medium) {
    current.referring_domain = 'direct'
    firstTouch.initial_referring_domain = 'direct'
  }

  if (referrerUrl) {
    current.referrer = referrerUrl
    firstTouch.initial_referrer = referrerUrl
  }

  return { current, firstTouch }
}
