export type Stage = 'ai_research' | 'expert_verified'
export type VerificationStatus = 'verified' | 'inferred' | 'uncertain'
export type RiskLevel = 'Low' | 'Medium' | 'High'
export type GapSeverity = 'critical' | 'moderate' | 'minor'

export interface FeasibilityQuestion {
  id: string
  question: string
  weight: number
  category: string
  helper?: string
}

export interface Blocker {
  severity: GapSeverity
  issue: string
  mitigation: string
  verificationStatus: VerificationStatus
}

export interface CriticalPhase {
  id: string
  phase: string
  duration: string
  cost: string
  riskLevel: RiskLevel
  dependencies: string[]
  requirements: string[]
  outputs: string[]
  blockers: Blocker[]
}

export interface EvidenceItem {
  claim: string
  source: string
  verificationStatus: VerificationStatus
  notes?: string
}

export interface GapItem {
  concern: string
  impact: string
  severity: GapSeverity
  resolvableWithExpertAnalysis: boolean
}

export interface Verdict {
  grade: string
  confidence: string
  mainMessage: string
  successProbability: number
  timeToFirstResult: string
  totalCost: string
  skillCeiling: string
  confidenceLevel: 'ai_inferred' | 'expert_verified'
}

export interface PaperSummary {
  title: string
  authors: string
  venue: string
  doi: string
}

export interface ExpertEnhancements {
  authorContacted: boolean
  datasetsVerified: string[]
  protocolClarifications: string[]
  additionalResources: string[]
  turnaround: string
}

export interface EvidenceBase {
  strongEvidence: EvidenceItem[]
  gaps: GapItem[]
  assumptions: string[]
}

export interface ResearchPaperAnalysis {
  stage: Stage
  lastUpdated: string
  reviewers: string[]
  paper: PaperSummary
  verdict: Verdict
  feasibilityQuestions: FeasibilityQuestion[]
  criticalPath: CriticalPhase[]
  evidenceBase: EvidenceBase
  expertEnhancements: ExpertEnhancements
}
