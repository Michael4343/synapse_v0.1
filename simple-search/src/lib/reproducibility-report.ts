import type { Citation } from './perplexity-deep-research'

type Assessment = 'EASY' | 'MODERATE' | 'DIFFICULT' | 'UNKNOWN'
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH'
type GapSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR'

type MetadataStatus = 'ok' | 'fallback'

export interface VerifyReproducibilityPayload {
  paperId: string
  generatedAt: string
  assessment: Assessment
  summary: string
  timeEstimate: string
  costEstimate: string
  skillLevel: string
  feasibilityFactors: string[]
  environment: {
    artefacts: string[]
    datasets: string[]
    code: string[]
    hardware: string[]
    tooling: string[]
  }
  hyperparameters: string[]
  seeds: string[]
  replicationEvidence: Array<{
    description: string
    confidence: Confidence
    sources: string[]
  }>
  risks: Array<{
    description: string
    severity: RiskSeverity
    sources: string[]
  }>
  gaps: Array<{
    description: string
    impact: string
    severity: GapSeverity
    sources: string[]
  }>
  reproductionPlan: string[]
  sources: Array<{
    label: string
    url: string
  }>
  metadata: {
    query: string
    durationMs: number
    citationCount: number
    status: MetadataStatus
    notes: string
  }
}

interface NormaliseParams {
  paperId: string
  query: string
  durationMs: number
  citations: Citation[]
  raw: any
}

const ASSESSMENT_SET: Assessment[] = ['EASY', 'MODERATE', 'DIFFICULT', 'UNKNOWN']
const CONFIDENCE_SET: Confidence[] = ['HIGH', 'MEDIUM', 'LOW']
const RISK_SET: RiskSeverity[] = ['LOW', 'MEDIUM', 'HIGH']
const GAP_SET: GapSeverity[] = ['CRITICAL', 'MAJOR', 'MINOR']

const AU_REPLACEMENTS: Array<[RegExp, string]> = [
  [/artifact/gi, 'artefact'],
  [/Artifact/gi, 'Artefact'],
  [/standardize/gi, 'standardise'],
  [/Standardize/gi, 'Standardise'],
  [/normalize/gi, 'normalise'],
  [/Normalize/gi, 'Normalise'],
  [/optimizer/gi, 'optimiser'],
  [/Optimizer/gi, 'Optimiser']
]

export function normaliseReproducibilityPayload(params: NormaliseParams): VerifyReproducibilityPayload {
  const { paperId, query, durationMs, citations, raw } = params
  const summary = sanitiseText(raw?.summary) || 'Automated analysis produced limited findings.'

  const payload: VerifyReproducibilityPayload = {
    paperId,
    generatedAt: new Date().toISOString(),
    assessment: normaliseAssessment(raw?.assessment),
    summary,
    timeEstimate: sanitiseText(raw?.timeEstimate) || 'UNKNOWN',
    costEstimate: sanitiseText(raw?.costEstimate) || 'UNKNOWN',
    skillLevel: sanitiseText(raw?.skillLevel) || 'UNKNOWN',
    feasibilityFactors: sanitiseList(raw?.feasibilityFactors),
    environment: {
      artefacts: sanitiseList(raw?.environment?.artefacts),
      datasets: sanitiseList(raw?.environment?.datasets),
      code: sanitiseList(raw?.environment?.code),
      hardware: sanitiseList(raw?.environment?.hardware),
      tooling: sanitiseList(raw?.environment?.tooling)
    },
    hyperparameters: sanitiseList(raw?.hyperparameters),
    seeds: sanitiseList(raw?.seeds),
    replicationEvidence: sanitiseEvidence(raw?.replicationEvidence),
    risks: sanitiseRisks(raw?.risks),
    gaps: sanitiseGaps(raw?.gaps),
    reproductionPlan: sanitiseList(raw?.reproductionPlan),
    sources: sanitiseSources(raw?.sources, citations),
    metadata: {
      query,
      durationMs,
      citationCount: citations.length,
      status: 'ok',
      notes: sanitiseText(raw?.notes) || 'Automated deep research summary.'
    }
  }

  ensureMinimumContent(payload)

  return payload
}

export function createFallbackReproducibilityPayload(args: {
  paperId: string
  paperTitle: string
  query: string
  durationMs: number
  reason: string
}): VerifyReproducibilityPayload {
  const { paperId, paperTitle, query, durationMs, reason } = args

  return {
    paperId,
    generatedAt: new Date().toISOString(),
    assessment: 'UNKNOWN',
    summary: `Automatic reproducibility analysis is unavailable for "${paperTitle}". Please review manually.`,
    timeEstimate: 'UNKNOWN',
    costEstimate: 'UNKNOWN',
    skillLevel: 'UNKNOWN',
    feasibilityFactors: [],
    environment: {
      artefacts: [],
      datasets: [],
      code: [],
      hardware: [],
      tooling: []
    },
    hyperparameters: [],
    seeds: [],
    replicationEvidence: [],
    risks: [],
    gaps: [],
    reproductionPlan: [],
    sources: [],
    metadata: {
      query,
      durationMs,
      citationCount: 0,
      status: 'fallback',
      notes: reason
    }
  }
}

export function buildReproducibilityResponseFormat(): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'verify_reproducibility_report',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'summary',
          'assessment',
          'timeEstimate',
          'costEstimate',
          'skillLevel',
          'feasibilityFactors',
          'environment',
          'hyperparameters',
          'seeds',
          'replicationEvidence',
          'risks',
          'gaps',
          'reproductionPlan',
          'sources'
        ],
        properties: {
          summary: { type: 'string', minLength: 4 },
          assessment: { type: 'string', enum: ASSESSMENT_SET },
          timeEstimate: { type: 'string', minLength: 2 },
          costEstimate: { type: 'string', minLength: 2 },
          skillLevel: { type: 'string', minLength: 2 },
          feasibilityFactors: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10
          },
          environment: {
            type: 'object',
            additionalProperties: false,
            required: ['artefacts', 'datasets', 'code', 'hardware', 'tooling'],
            properties: {
              artefacts: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              datasets: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              code: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              hardware: { type: 'array', items: { type: 'string' }, maxItems: 10 },
              tooling: { type: 'array', items: { type: 'string' }, maxItems: 10 }
            }
          },
          hyperparameters: { type: 'array', items: { type: 'string' }, maxItems: 12 },
          seeds: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          replicationEvidence: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['description', 'confidence', 'sources'],
              properties: {
                description: { type: 'string', minLength: 3 },
                confidence: { type: 'string', enum: CONFIDENCE_SET },
                sources: { type: 'array', items: { type: 'string' }, maxItems: 5 }
              }
            },
            maxItems: 8
          },
          risks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['description', 'severity', 'sources'],
              properties: {
                description: { type: 'string', minLength: 3 },
                severity: { type: 'string', enum: RISK_SET },
                sources: { type: 'array', items: { type: 'string' }, maxItems: 5 }
              }
            },
            maxItems: 6
          },
          gaps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['description', 'impact', 'severity', 'sources'],
              properties: {
                description: { type: 'string', minLength: 3 },
                impact: { type: 'string', minLength: 3 },
                severity: { type: 'string', enum: GAP_SET },
                sources: { type: 'array', items: { type: 'string' }, maxItems: 5 }
              }
            },
            maxItems: 6
          },
          reproductionPlan: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 8
          },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'url'],
              properties: {
                label: { type: 'string', minLength: 2 },
                url: { type: 'string', minLength: 4 }
              }
            },
            maxItems: 15
          },
          notes: { type: 'string' }
        }
      }
    }
  }
}

function ensureMinimumContent(payload: VerifyReproducibilityPayload) {
  if (!payload.feasibilityFactors.length) {
    payload.feasibilityFactors.push('UNKNOWN')
  }
  if (!payload.reproductionPlan.length) {
    payload.reproductionPlan.push('UNKNOWN')
  }
  if (!payload.sources.length) {
    payload.sources.push({ label: 'UNKNOWN', url: 'UNKNOWN' })
  }
}

function normaliseAssessment(value: unknown): Assessment {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase() as Assessment
    if (ASSESSMENT_SET.includes(upper)) {
      return upper
    }
  }
  return 'UNKNOWN'
}

function sanitiseText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  return applyAustralianEnglish(trimmed)
}

function sanitiseList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const results = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => Boolean(item))
    .map(applyAustralianEnglish)

  return dedupe(results)
}

function sanitiseEvidence(value: unknown): VerifyReproducibilityPayload['replicationEvidence'] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries = value as Array<Record<string, unknown>>
  return entries.reduce<VerifyReproducibilityPayload['replicationEvidence']>((acc, entry) => {
    const description = sanitiseText(getEntryValue(entry, 'description'))
    const confidence = normaliseConfidence(getEntryValue(entry, 'confidence'))
    const sources = sanitiseList(getEntryValue(entry, 'sources'))

    if (description) {
      acc.push({ description, confidence, sources })
    }

    return acc
  }, [])
}

function sanitiseRisks(value: unknown): VerifyReproducibilityPayload['risks'] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries = value as Array<Record<string, unknown>>
  return entries.reduce<VerifyReproducibilityPayload['risks']>((acc, entry) => {
    const description = sanitiseText(getEntryValue(entry, 'description'))
    const severity = normaliseRiskSeverity(getEntryValue(entry, 'severity'))
    const sources = sanitiseList(getEntryValue(entry, 'sources'))

    if (description) {
      acc.push({ description, severity, sources })
    }

    return acc
  }, [])
}

function sanitiseGaps(value: unknown): VerifyReproducibilityPayload['gaps'] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries = value as Array<Record<string, unknown>>
  return entries.reduce<VerifyReproducibilityPayload['gaps']>((acc, entry) => {
    const description = sanitiseText(getEntryValue(entry, 'description'))
    const impact = sanitiseText(getEntryValue(entry, 'impact')) || 'UNKNOWN'
    const severity = normaliseGapSeverity(getEntryValue(entry, 'severity'))
    const sources = sanitiseList(getEntryValue(entry, 'sources'))

    if (description) {
      acc.push({ description, impact, severity, sources })
    }

    return acc
  }, [])
}

function sanitiseSources(value: unknown, citations: Citation[]): VerifyReproducibilityPayload['sources'] {
  const sources: VerifyReproducibilityPayload['sources'] = []

  if (Array.isArray(value)) {
    const entries = value as Array<Record<string, unknown>>
    entries.forEach((entry) => {
      const label = sanitiseText(getEntryValue(entry, 'label'))
      const url = sanitiseText(getEntryValue(entry, 'url'))
      if (label && url) {
        sources.push({ label, url })
      }
    })
  }

  citations.forEach((citation) => {
    const url = sanitiseText(citation.url)
    const label = sanitiseText(citation.title) || url
    if (url && !sources.some((source) => source.url === url)) {
      sources.push({ label: label || 'Source', url })
    }
  })

  return sources
}

function normaliseConfidence(value: unknown): Confidence {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase() as Confidence
    if (CONFIDENCE_SET.includes(upper)) {
      return upper
    }
  }
  return 'LOW'
}

function normaliseRiskSeverity(value: unknown): RiskSeverity {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase() as RiskSeverity
    if (RISK_SET.includes(upper)) {
      return upper
    }
  }
  return 'MEDIUM'
}

function normaliseGapSeverity(value: unknown): GapSeverity {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase() as GapSeverity
    if (GAP_SET.includes(upper)) {
      return upper
    }
  }
  return 'MAJOR'
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

function applyAustralianEnglish(value: string): string {
  return AU_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)
}

function getEntryValue<T>(entry: Record<string, unknown>, key: string): T | undefined {
  return entry[key] as T | undefined
}
