# Academic Research Aggregator MVP - Development Plan

## Overview
Stage-based development plan for building a Next.js + Supabase academic research aggregation platform. Each stage builds on the previous one with clear testing criteria before progression.

## Core Vision
**Build a clean, working MVP that lets researchers search across multiple academic repositories and view results in a single, unified feed.**

## Stage Progress Tracking

| Stage | Name | Status | Completion |
|-------|------|--------|------------|
| 1 | Foundation | 🔴 Not Started | 0% |
| 2 | Search Core | 🔴 Not Started | 0% |
| 3 | User Interface | 🔴 Not Started | 0% |
| 4 | User Features | 🔴 Not Started | 0% |
| 5 | Notifications | 🔴 Not Started | 0% |
| 6 | Optimization | 🔴 Not Started | 0% |

## Quick Start
1. Read through each stage file in order
2. Complete Stage 1 acceptance criteria before moving to Stage 2
3. Update this README with progress as you complete each stage
4. Test thoroughly at each stage boundary

## Technical Stack
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Auth, Database, Edge Functions)
- **APIs:** arXiv, PubMed, bioRxiv, medRxiv, IEEE Xplore
- **Deployment:** Vercel + Supabase Cloud

## API Integration Priority
1. **arXiv** (Stage 2): Free, no auth, 3s rate limit
2. **PubMed** (Stage 6): Free, optional API key for higher rates
3. **bioRxiv/medRxiv** (Stage 6): Free, requires S3 integration
4. **IEEE Xplore** (Stage 6): Free tier, API key required

**Deferred:** Google Scholar, Scopus, Google Patents (paid/complex)

## Success Criteria
- ✅ Search completes in <3 seconds for 3+ sources
- ✅ 95% uptime for core search functionality
- ✅ Users can save searches and receive reliable email updates
- ✅ Clean, responsive UI works on mobile and desktop