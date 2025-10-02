# Reproducibility Assessment - MVP Specification

## Overview

Simple AI-powered reproducibility analysis that helps researchers quickly assess if they can reproduce a paper's methods or claims.

**Core Goal**: Answer "Can I reproduce this in my lab?" in under 30 seconds.

---

## MVP Features (v0.1)

### 1. Quick Verdict
**What**: Simple assessment at the top of paper detail page

**Shows**:
- 🎯 **Reproducibility Score**: Easy / Moderate / Difficult / Unknown
- ⏱️ **Estimated Time**: e.g., "2-3 weeks", "3-6 months"
- 💰 **Cost Range**: e.g., "$500-2K", "$10K+"
- 🔬 **Skill Level**: Undergrad / Grad / Expert

### 2. What You'll Need
**Simple checklist of requirements**:
- Data availability (public/restricted/contact authors)
- Code availability (GitHub link / contact authors / none)
- Equipment needed (basic list)
- Special expertise required

### 3. Key Information Gaps
**What's missing from the paper**:
- ⚠️ **Critical**: Blocks reproduction entirely
- ⚡ **Important**: Makes reproduction difficult
- ℹ️ **Minor**: May cause minor delays

**Each gap shows**:
- What's missing
- Why it matters
- How to possibly resolve it

### 4. Related Methods
**Shows 3-5 papers with similar methods** (uses existing `/api/research/compile` endpoint)
- Links to related papers
- Quick context on relevance

---

## Data Model (Simple)

```typescript
interface ReproducibilityReport {
  // Paper reference
  paperId: string
  paperTitle: string

  // Quick verdict
  verdict: {
    score: 'easy' | 'moderate' | 'difficult' | 'unknown'
    timeEstimate: string      // e.g., "2-3 weeks"
    costEstimate: string       // e.g., "$500-2K"
    skillLevel: string         // e.g., "Graduate level"
    summary: string            // One sentence
  }

  // Requirements
  requirements: {
    dataAvailability: 'public' | 'restricted' | 'request' | 'unavailable'
    dataLocation?: string
    codeAvailability: 'public' | 'request' | 'unavailable'
    codeLocation?: string
    equipment: string[]
    expertise: string[]
  }

  // Gaps (what's missing)
  gaps: Array<{
    severity: 'critical' | 'important' | 'minor'
    description: string
    impact: string
    resolution?: string
  }>

  // Related work
  relatedPapers?: Array<{
    id: string
    title: string
    relevance: string
  }>

  // Metadata
  generatedAt: string
  confidence: 'high' | 'medium' | 'low'
  sources: string[]  // What was analyzed
}
```

---

## Implementation Plan

### Phase 1: Basic Structure (1-2 days)
- [ ] Add `reproducibility_reports` table to database
- [ ] Create `/api/papers/[id]/reproducibility` endpoint
- [ ] Add "Reproducibility" tab to paper detail page
- [ ] Show loading state and basic structure

### Phase 2: AI Analysis (2-3 days)
- [ ] Use Perplexity/Gemini to analyze paper abstract + scraped content
- [ ] Generate verdict (score, time, cost, skill)
- [ ] Extract requirements (data, code, equipment)
- [ ] Identify information gaps
- [ ] Cache results in database

### Phase 3: UI Polish (1 day)
- [ ] Design clean, scannable UI
- [ ] Add icons and visual hierarchy
- [ ] Mobile-responsive layout
- [ ] Link to related papers

---

## Database Schema

```sql
-- Simple table for reproducibility reports
CREATE TABLE reproducibility_reports (
  id BIGSERIAL PRIMARY KEY,
  paper_id TEXT NOT NULL UNIQUE,
  paper_title TEXT NOT NULL,

  -- Verdict
  score TEXT NOT NULL CHECK (score IN ('easy', 'moderate', 'difficult', 'unknown')),
  time_estimate TEXT,
  cost_estimate TEXT,
  skill_level TEXT,
  summary TEXT,

  -- Full report JSON
  report_data JSONB NOT NULL,

  -- Metadata
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sources TEXT[]
);

CREATE INDEX idx_reproducibility_paper_id ON reproducibility_reports(paper_id);
```

---

## User Flow

1. **User clicks on paper** → Paper detail page loads
2. **User sees "Reproducibility" tab** → Clicks to view assessment
3. **Loading state** → "Analyzing reproducibility..."
4. **AI analyzes**:
   - Paper abstract
   - Full text (if available)
   - Supplementary materials
   - Linked repositories
5. **Report displays** → Quick verdict, requirements, gaps, related papers
6. **User decides** → "Yes, I can do this" or "Too difficult"

---

## AI Prompt Strategy

**Simple, focused prompts**:

```
Analyze this research paper for reproducibility:

Title: [title]
Abstract: [abstract]
Full Text: [first 10K chars if available]

Provide:
1. Reproducibility score (easy/moderate/difficult/unknown)
2. Time estimate to reproduce
3. Approximate cost
4. Skill level required
5. Data availability
6. Code availability
7. Equipment needed
8. Critical information gaps

Format as JSON matching the schema provided.
```

---

## Success Criteria

**For MVP**:
- ✅ Researchers can view reproducibility assessment for any paper
- ✅ Assessment loads in <5 seconds (cached) or <30 seconds (fresh)
- ✅ Clear verdict helps make go/no-go decisions
- ✅ Information gaps are clearly identified
- ✅ Works on mobile and desktop

**Researchers say**:
> "I can quickly tell if this paper is reproducible in my lab without reading the whole thing."

---

## Future Enhancements (Post-MVP)

### v0.2
- Community contributions (users can update/correct assessments)
- Reproducibility history tracking
- Comparison across similar papers

### v0.3
- Expert reviews (paid service)
- Institution-specific assessments
- Integration with lab equipment databases

### v1.0
- Personalized feasibility based on user's lab profile
- Step-by-step reproduction guides
- Success tracking (who successfully reproduced what)
