# Reproducibility Report - Product Requirements

## What We're Building

A two-stage reproducibility assessment system that progressively deepens analysis.

---

## Two-Stage Approach

### Stage 1: AI Deep Research Report
**Automated analysis using publicly available information**

- AI reads the paper, supplementary materials, linked repositories
- Deep web search for protocols, datasets, related discussions
- Generates complete report with what can be determined automatically
- Clearly flags gaps where information is unavailable or uncertain
- **Available immediately for all papers**

**Confidence indicators**:
- ✅ Verified from paper/supplements
- 🔍 Inferred from related sources
- ❓ Uncertain/missing information

### Stage 2: Expert-Enhanced Analysis
**Manual investigation by our team**

Requested by users when they need deeper analysis. We:
- Access datasets/code that require authentication or special access
- Contact paper authors for clarifications
- Review institutional repositories or unpublished protocols
- Consult with domain experts
- Test access to restricted resources
- Verify assumptions with actual researchers in the field

**Upgraded report includes**:
- Author-confirmed protocols
- Access instructions for gated resources
- Real-world reproduction timelines from practitioners
- Lab-specific guidance
- Higher confidence ratings

---

## Core Features (Both Stages)

### 1. Hero Verdict
- Large grade display (A-F)
- Quick stats: success rate, time, cost, skill level
- One-sentence bottom line summary
- **Badge showing**: "AI Analysis" or "Expert-Verified"

### 2. Personalized Feasibility Check
- 4-6 yes/no questions about lab capabilities
- Dynamic feasibility score based on their answers
- Tells them if they need collaborators/resources

### 3. Critical Path Roadmap
- Sequential phases (e.g., Design → Cloning → Testing)
- Each phase shows: duration, cost, risk level, requirements
- Expandable details reveal blockers and mitigations
- Shows dependencies between phases
- **Stage 2 adds**: Author-confirmed details, real-world timelines

### 4. Evidence Assessment
- **Strong Evidence**: What's clearly documented with citations
- **Information Gaps**: What's missing and why it matters
- Severity-weighted (critical vs minor gaps)
- **Stage 2 fills**: Many gaps with expert investigation

### 5. Request Detailed Analysis
**Prominent option in Stage 1 reports**:
- "Need more detail? Request expert analysis"
- Shows what additional information we'll provide
- Explains the enhanced investigation process
- Estimated turnaround time (e.g., 1-2 weeks)
- User submits request with specific concerns/questions

---

## Stage Comparison

| Aspect | Stage 1: AI Research | Stage 2: Expert Analysis |
|--------|---------------------|------------------------|
| **Speed** | Instant | 1-2 weeks |
| **Sources** | Public only | Public + gated + author contact |
| **Confidence** | Medium-High | High |
| **Cost** | Free | Paid/subscription |
| **Gaps** | Flagged | Resolved where possible |
| **Protocols** | As published | Author-clarified |
| **Access** | Generic | Institution-specific guidance |

---

## Data Model

```
ReproducibilityReport {
  stage: "ai_research" | "expert_verified"
  
  paper: { title, authors, venue, doi }
  
  verdict: {
    grade: A-F
    confidence: High/Medium/Low
    mainMessage: string
    successProbability: 0-100
    timeToFirstResult: string
    totalCost: string
    skillCeiling: string
    confidenceLevel: "ai_inferred" | "expert_verified"
  }
  
  criticalPath: [{
    phase, duration, cost, riskLevel,
    dependencies, outputs, requirements,
    blockers: [{ 
      severity, issue, mitigation,
      verificationStatus: "verified" | "inferred" | "uncertain"
    }]
  }]
  
  evidenceBase: {
    strongEvidence: [{ claim, source, verified, confidenceLevel }]
    gaps: [{ concern, impact, severity, resolvableWithExpertAnalysis }]
    assumptions: []
  }
  
  feasibilityQuestions: [{
    id, question, weight, category
  }]
  
  expertEnhancements?: {
    authorContacted: boolean
    datasetsVerified: []
    protocolClarifications: []
    additionalResources: []
  }
  
  lastUpdated, reviewers
}
```

---

## User Flow

### Stage 1 (Default)
1. User views paper
2. AI report loads instantly
3. User sees analysis with confidence indicators
4. Gaps are clearly marked

### Stage 1 → Stage 2 Upgrade
1. User clicks "Request Expert Analysis"
2. Form: What specific questions do you have? What are you trying to reproduce?
3. We review and provide estimate
4. User confirms request
5. We investigate over 1-2 weeks
6. Enhanced report published
7. User notified

---

## Key Principles

**Progressive Disclosure**: Start with what we can determine automatically, offer deeper analysis on demand

**Transparency**: Always show what's verified vs inferred vs uncertain

**Practical**: Stage 1 answers "should I try this?" / Stage 2 answers "exactly how do I do this?"

**Evidence-Based**: Every claim cites sources and shows confidence level

**Demand-Driven**: Only do expensive manual work when users specifically need it

---

## UI Indicators

### Stage 1: AI Report
- Badge: "AI Deep Research"
- Confidence icons throughout (✅ 🔍 ❓)
- Prominent "Request Expert Analysis" button
- Clear list of what expert analysis would add

### Stage 2: Expert Report
- Badge: "Expert-Verified Analysis"
- "Enhanced by [reviewer names]" 
- "Last updated: [date]"
- Shows what was added in expert review
- Higher confidence ratings throughout

---

## Success Criteria

**Stage 1**: Researchers can make go/no-go decisions confidently
**Stage 2**: Researchers can actually execute the reproduction with our guidance

Researchers say: 
- Stage 1: "This told me if I should attempt this"
- Stage 2: "This showed me exactly how to do it"