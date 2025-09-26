# CLAUDE.md - Project Development Guide

This file provides guidance for Claude when working with code in this repository.

## 🎯 Core Philosophy: Simple, Working, Maintainable

### Development Principles
1. **Start Simple** - Build the simplest working solution first
2. **Validate Early** - Get user feedback before over-engineering
3. **Iterate Thoughtfully** - Add complexity only when needed
4. **Document Clearly** - Make handoffs and maintenance easier

## Planning & Execution

### Before Starting
- Write a brief implementation plan to `.claude/tasks/TASK_NAME.md`
- Define the MVP scope clearly
- Document assumptions and approach
- Update the plan as you work

### Task Strategy
- Focus on getting core functionality working first
- Make incremental improvements
- Test changes before marking complete
- Document decisions for future reference

## Code Standards

### Quality Guidelines
- **Clarity** - Write readable, self-documenting code
- **Consistency** - Match existing patterns in the codebase
- **Simplicity** - Avoid premature optimization
- **Completeness** - Ensure changes work end-to-end

### Progressive Development
```
v0.1 → Basic working prototype
v0.2 → Handle main use cases
v0.3 → Add error handling
v1.0 → Production-ready
```

### When to Add Complexity
✅ Code is repeated 3+ times → Extract to function/component  
✅ Prop drilling exceeds 3 levels → Consider state management  
✅ Performance issues are measured → Optimize  
✅ Multiple developers need clear interfaces → Add abstractions  

## Frontend Development

### Tech Stack (When Established)
- **Framework**: React/Next.js with TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **State**: useState/Context for simple, Zustand for complex
- **Icons**: Lucide or Heroicons

### Directory Structure
Start simple, evolve as needed:
```
/src
  /components    # Reusable UI components
  /hooks         # Custom React hooks (when patterns emerge)
  /lib           # Utilities and helpers
  /app or /pages # Routes
```

## Development Workflow

### Common Commands
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run test     # Run tests
npm run lint     # Check code quality
```

### Progress Communication
1. Clarify the task requirements
2. Outline the approach
3. Implement incrementally
4. Summarize what was completed

## Testing & Verification

### MVP Checklist
- [ ] Core feature works as intended
- [ ] No breaking errors
- [ ] Basic user flow is complete

### Production Checklist
- [ ] Tests pass
- [ ] Error handling in place
- [ ] Documentation updated
- [ ] Security considerations addressed

## Best Practices

### Start With
- Working code over perfect architecture
- Inline styles before component libraries
- Local state before state management
- Manual testing before automation

### Evolve To
- Reusable components when patterns emerge
- Proper error boundaries when stable
- Optimized performance when measured
- Comprehensive tests when validated

### Avoid
- Over-engineering before validation
- Abstractions for single-use cases
- Premature performance optimization
- Complex architecture without clear need

## Security & Deployment

### Key Considerations
- Keep sensitive data in environment variables
- Validate user inputs
- Use HTTPS in production
- Follow security best practices

### Documentation
- README with setup instructions
- API documentation if applicable
- Architecture decisions when relevant
- Deployment instructions

## Remember
**Good code ships and works.** Start simple, iterate based on real needs, and maintain code quality without over-engineering. The best solution is often the simplest one that solves the problem.

---

## 📋 Academic Research Aggregator MVP - Project Plan

### Project Overview
Building a Next.js + Supabase academic research aggregation platform that allows researchers to search across multiple academic repositories and view results in a unified feed.

**✅ Recent Updates:**
- **Rebrand Complete (v0.1.1)**: Successfully rebranded from "Synapse" to "Evidentia" across all frontend UI, API user agents, configuration files, and documentation. All references have been updated to maintain consistent branding throughout the application.
- **Personal Feed UX Improvement (v0.1.2)**: Enhanced the personal feed button in the sidebar with an RSS icon and improved text hierarchy. Changed from user-name-focused display to "Your Personal Feed" with clear actionable text, making the feature more discoverable and intuitive for users.
- **Rate Limiting & API Stability (v0.1.3)**: Resolved 429 rate limit errors by implementing comprehensive rate limiting controls:
  - **Server-side**: Added request counting, deduplication, exponential backoff, and circuit breaker pattern to prevent API overuse
  - **Client-side**: Added 2-second delays between personal feed queries, early failure termination, and better error messaging
  - **Caching**: Improved cache utilization with graceful fallbacks to older results when API is rate-limited
  - **Reliability**: Personal feed now handles API failures gracefully and provides informative user feedback
- **Personal Feed Time Filtering (v0.1.4)**: Fixed misleading "last 24h" labels showing months-old papers:
  - **Realistic timeframe**: Changed from 24-hour to 7-day window for academic publishing patterns
  - **Honest labeling**: Updated UI from "last 24h" to "recent" to match actual content
  - **Smarter fallback**: Only shows older papers if very few recent ones exist, and sorts them by recency
  - **Better sorting**: Final results sorted by publication date (most recent first)
- **Performance Optimization (v0.1.5)**: Dramatically improved personal feed loading speed from 40+ seconds to 10-15 seconds:
  - **Ratings caching**: Eliminated 5+ redundant API calls by caching ratings and only fetching for new papers
  - **Progressive loading**: Show results as they come in instead of waiting for all queries to complete
  - **Smart query limiting**: Limited personal feed to 4 most important queries (was unlimited)
  - **Increased delays**: 3-4s delays with jitter between queries (was 2s) to reduce rate limiting
  - **Timeout protection**: 1-minute maximum load time to prevent infinite waiting
  - **Enhanced rate limiting**: Progressive delays as API usage approaches limits, better circuit breaker
  - **Better UX**: Progress indicators show "Loading 2/4 queries..." with partial results displayed
- **Infinite Loop Fix (v0.1.6)**: Resolved critical issue causing constant API calls and feed refreshing:
  - **Root cause**: Circular dependency chain in React hooks - `fetchPaperRatings` useCallback depended on `[user]`, main useEffect depended on `fetchPaperRatings`, causing recreation cascades
  - **Solution**: Stabilized dependencies by using `user?.id` instead of full `user` object, removed function dependencies from useEffect arrays
  - **Impact**: From continuous `/api/ratings` calls to normal single calls, stable feed loading
  - **Dependencies**: Changed useCallback dependencies from `[user]` to `[user?.id]` for API functions, removed circular dependencies

### Current Directory Structure
```
/evidentia v0.1/
├── AGENTS.md                     # Collaboration guardrails for all agents
├── CLAUDE.md                     # This file - project guidance
├── academic_repos.md             # API availability reference
├── semantic_scholar.md           # Semantic Scholar endpoint quick reference
├── /plan/                        # Stage-based development plan
│   ├── README.md                 # Plan overview and progress tracking
│   ├── stage-1-foundation.md     # Project setup and infrastructure
│   ├── stage-2-search-core.md    # Basic search implementation
│   ├── stage-3-user-interface.md # Frontend and UX
│   ├── stage-4-user-features.md  # Authentication and saved searches
│   ├── stage-5-notifications.md  # Email updates system
│   ├── stage-6-optimization.md   # Performance and multi-API
│   └── acceptance-criteria.md    # Testing requirements
└── /simple-search/               # Next.js + Supabase application
    ├── package.json              # App dependencies and scripts
    ├── supabase/migrations/       # Database schema migrations
    │   ├── 001_initial_schema.sql      # Core tables (profiles, feed_items, etc.)
    │   ├── 002_profile_trigger.sql     # Auto-create profiles on signup
    │   ├── 003_add_keywords_profile_type.sql # Keywords support
    │   ├── 004_add_feed_preferences.sql     # User feed customization
    │   ├── 005_add_feed_sessions.sql       # Feed history tracking
    │   ├── 006_add_user_favourites.sql     # User favorites system
    │   └── 007_add_user_lists.sql          # Save to list functionality
    └── src/
        ├── app/
        │   ├── api/
        │   │   ├── search/route.ts          # Supabase-backed Semantic Scholar proxy
        │   │   └── lists/                   # List management API
        │   │       ├── route.ts             # Create/fetch user lists
        │   │       └── [id]/items/route.ts  # Add/remove papers from lists
        │   ├── search/page.tsx              # Keyword search UI with live tiles
        │   ├── page.tsx                     # Main dashboard with auth & lists
        │   └── layout.tsx                   # Root layout with auth provider
        ├── components/
        │   ├── auth-modal.tsx               # Login/signup modal
        │   ├── save-to-list-modal.tsx       # Save papers to lists modal
        │   ├── login-form.tsx               # Login form component
        │   ├── register-form.tsx            # Registration form component
        │   └── ui/message.tsx               # UI message component
        └── lib/
            ├── auth-context.tsx             # Auth state management
            ├── auth-hooks.ts                # Auth utility hooks
            ├── supabase.ts                  # Browser client
            └── supabase-server.ts           # Service-role client for server routes
```

### Development Approach
**Stage-based development** with clear testing criteria at each stage before progression:

1. **Stage 1: Foundation** - Next.js + Supabase setup with auth
2. **Stage 2: Search Core** - Single API (arXiv) integration
3. **Stage 3: User Interface** - Complete search experience with filters
4. **Stage 4: User Features** - Authentication and saved searches
5. **Stage 5: Notifications** - Email update system
6. **Stage 6: Optimization** - Multi-API integration and performance

### Search Backend Integration (v0.1)
- `/api/search` proxies Semantic Scholar through Supabase: it checks cached entries, fetches fresh data when needed, and persists responses for reuse.
- Environment variables required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SEMANTIC_SCHOLAR_API_KEY` for higher request quotas, and optional `SEMANTIC_SCHOLAR_USER_AGENT` (defaults to a generic contact string).
- Cached results remain fresh for 6 hours; stale data is returned if the upstream API fails so the UI always renders something.
- Tile feed renders in `simple-search/src/app/search/page.tsx`, using `/api/search` to populate cards under the search bar.
- Supabase schema lives in `simple-search/supabase/migrations/`; keep RLS policies aligned with user-specific access control.

### Save to List Feature (v0.2)
- **Modal Interface**: Clean modal popup for saving papers to lists with create new list option
- **Database Tables**: `user_lists` stores named lists, `list_items` stores papers in JSON format
- **API Endpoints**: `/api/lists` (GET/POST) for list management, `/api/lists/[id]/items` (GET/POST) for paper operations
- **UI Integration**: Sign out button moved to top-right header, sidebar shows user's actual lists with item counts
- **User Flow**: Click "Save to List" → Modal opens → Select existing list or create new → Paper saved → Sidebar updates
- **Security**: Full RLS policies ensure users only access their own lists and items

### API Integration Priority
1. **arXiv** (Stage 2): Free, no auth, 3s rate limit
2. **PubMed** (Stage 6): Free, optional API key
3. **bioRxiv/medRxiv** (Stage 6): Free, S3 integration
4. **IEEE Xplore** (Stage 6): Free tier with API key

### Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Database, Edge Functions)
- **Deployment**: Vercel + Supabase Cloud
- **Email**: Resend for notifications

### Success Criteria
- Search across 3+ sources in <3 seconds
- Users can save searches and receive email updates
- Clean, responsive UI on mobile and desktop
- 95% uptime with graceful error handling

ALWAYS UPDATE CLAUDE.md AT THE END OF EACH STEP WITH THE NEW DIRECTORY STRUCTURE AND IF NECASSARY CREATE A DOC TO GO IN DOCS WITH THE MORE DETAILS OF WHAT YOU HAVE DONE. DO NOT START NEW SERVERS THERE WILL BE ONE RUNNING YOU CAN USE FOR TESTS!!!
I WILL RUN THE TESTS ON MY DEV SERVER SO PLEASE DO NOT DO THIS JUST STOP ONCE YOU HAVE IMPLEMENTED THE FEATURES