export type Stage = 'ai_research' | 'human_review' | 'community_feedback'

export type ConfidenceLevel = 'verified' | 'inferred' | 'uncertain'
export type GapSeverity = 'critical' | 'moderate' | 'minor'

export interface FeasibilityQuestion {
  id: string
  question: string
  weight: number
  helper?: string
  category?: string
}

export interface PrimaryRisk {
  severity: GapSeverity
  issue: string
  mitigation: string
}

export interface CriticalPhase {
  id: string
  name: string
  deliverable: string
  checklist: string[]
  primaryRisk: PrimaryRisk | null
}

export interface EvidenceHighlight {
  claim: string
  source: string
  confidence?: ConfidenceLevel
  notes?: string
}

export interface EvidenceGap {
  description: string
  impact: string
  severity: GapSeverity
  needsExpert?: boolean
}

export interface ResearchPaperAnalysis {
  stage: Stage
  lastUpdated: string
  reviewers: string[]
  summary: string
  paper: {
    title: string
    authors: string
    venue: string
    doi: string | null
  }
  feasibilityQuestions: FeasibilityQuestion[]
  criticalPath: CriticalPhase[]
  evidence: {
    strong: EvidenceHighlight[]
    gaps: EvidenceGap[]
    assumptions: string[]
  }
}
