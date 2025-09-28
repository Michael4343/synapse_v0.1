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
- **ArXiv Full Paper Access (v0.1.7)**: Fixed scraper to access full arXiv papers instead of just abstracts:
  - **Root cause**: Scraper prioritized abstract pages (`/abs/`) which have ~1000 chars, stopping before trying full content sources
  - **Solution**: Reordered URL priority to try arXiv HTML versions first (`/html/`), then PDF (`/pdf/`), with abstract as fallback
  - **Quality detection**: Added smart content assessment distinguishing full papers (5,000+ chars) from abstracts (500-2,000 chars)
  - **Database tracking**: New fields `content_quality` and `content_type` to track scraping success and source type
  - **UI improvements**: Quality badges show "Full Paper (HTML)" vs "Abstract Only" with source information
  - **Impact**: ArXiv papers now display complete full text instead of just abstracts when HTML versions are available
- **List Loading Performance Fix (v0.1.8)**: Fixed critical performance issues causing 6-25 second load times:
  - **Root cause identified**: List loading triggered automatic rating API calls for every paper, causing rate limiting (429 errors)
  - **External API elimination**: Removed automatic ratings fetching from list operations - now only database queries
  - **Simplified caching**: Replaced complex background refresh with basic 30-minute localStorage cache
  - **Database optimization**: Removed complex materialized views, kept only essential indexes for user_lists and list_items
  - **API simplification**: Reverted to basic queries without bulk loading, pagination, or query parameters
  - **Performance improvement**: Target <1 second list loading vs previous 6-25 seconds
  - **Rate limiting fix**: Eliminated 429 errors during list operations by removing external API dependencies
- **Database Migration Consolidation (v0.1.9)**: Cleaned up and simplified Supabase migrations for better maintainability:
  - **Migration cleanup**: Consolidated 15 scattered migrations into 5 well-organized files
  - **Logical grouping**: Core schema, auth functions, permissions, indexes, and performance fixes now separated clearly
  - **Eliminated redundancy**: Removed duplicate permission grants, scattered schema changes, and redundant indexes
  - **Fixed incomplete migrations**: Properly completed publication_date addition and other partial changes
  - **Better organization**: Related functionality now grouped together instead of spread across many small files
  - **Maintainability**: Much easier to understand and modify the database schema going forward
- **Homepage Layout Polish (v0.1.10)**: Improved homepage formatting to match the polished login page design:
  - **Consistent spacing**: Increased main container gaps from `gap-2` to `gap-6` and inner container gaps to match
  - **Better padding**: Enhanced vertical padding from `py-1` to `py-6` for improved breathing room and visual hierarchy
  - **Polished shadows**: Updated all card shadows from basic `shadow-[0_25px_60px_rgba(15,23,42,0.08)]` to elegant `shadow-[0_30px_80px_rgba(15,23,42,0.25)]` to match login modal
  - **Consistent padding**: Increased card padding from `p-4` to `p-6` across all main elements (sidebar, feed cards, detail panels, tiles)
  - **Unified border radius**: Updated tiles from `rounded-xl` to `rounded-3xl` to match main cards for visual consistency
  - **Design coherence**: Homepage now matches the login page's sophisticated, polished aesthetic throughout
- **ORCID Personalization Feature (v0.1.11)**: Activated the existing ORCID integration to enable AI-powered keyword extraction:
  - **ORCID input enabled**: Removed "Coming soon" labels and disabled states from ORCID input field and buttons
  - **Validation restored**: Re-enabled ORCID format validation with proper regex pattern (0000-0000-0000-0000)
  - **API integration active**: Profile enrichment now calls `/api/profile/enrich` endpoint with ORCID data instead of simple keyword clustering
  - **Full workflow enabled**: Users can input ORCID ID → system fetches publications → Gemini LLM extracts keywords → personalization updated
  - **UI updates**: Profile editor shows "Add your ORCID iD and keywords to personalise your feed with AI-powered recommendations"
  - **Clean implementation**: Activated existing infrastructure (95% was already implemented) without adding complexity or extra features
- **ORCID UX Enhancement (v0.1.12)**: Dramatically improved ORCID input experience with smart formatting and flexible validation:
  - **Auto-formatting**: ORCID input now automatically adds dashes as user types (e.g., typing "0000000218250097" becomes "0000-0002-1825-0097")
  - **Flexible input**: Accepts ORCID with or without dashes - users can paste any format and it will be normalized and validated correctly
  - **Smart validation**: New validation functions (`validateOrcidId`, `normalizeOrcidId`, `formatOrcidId`) handle 16-digit validation with detailed error messages
  - **Better guidance**: Updated placeholder text to "Enter ORCID iD (e.g., 0000-0002-1825-0097)" and added helpful description below input
  - **Mobile optimized**: Uses `inputMode="numeric"` for numeric keypad on mobile devices
  - **Consistent formatting**: Existing ORCID values are automatically formatted when loaded from profile or during editing
  - **User-friendly UX**: Clean, simple interface that makes ORCID entry effortless for researchers
- **Separated ORCID & Profile Workflows (v0.1.17)**: Completely redesigned ORCID and profile saving for clean separation of concerns:
  - **ORCID Save Button**: New "Save" button next to ORCID input that only fetches keywords and populates manual keywords field
  - **Profile Save Button**: Simplified to only save form data (ORCID, website, keywords) without heavy API calls
  - **New API Endpoint**: `/api/profile/keywords-from-orcid` provides lightweight keyword extraction from ORCID data
  - **Graceful Error Handling**: ORCID API failures no longer break the workflow - returns empty results and continues
  - **Optional ORCID**: Both ORCID save and profile save now treat ORCID as completely optional
  - **Simple Personalization**: Profile save creates lightweight personalization directly from manual keywords
  - **Restored Personal Feed**: Fixed `manual_keywords` field in personalization to properly enable personal feed display
  - **Clean UX Flow**: Enter ORCID → Save ORCID → Review keywords → Save Profile → Personal Feed works
- **ORCID Error Messaging Fix (v0.1.18)**: Improved error handling to show specific ORCID errors in the profile modal:
  - **Specific Error Messages**: ORCID API now returns clear messages like "ORCID ID not found" instead of generic errors
  - **Modal Error Display**: ORCID errors now appear in the profile settings modal where users are working, not in the feed
  - **Error Categorization**: Different messages for 404 (not found), timeouts, and connection failures
  - **Clean State Management**: Errors are cleared when opening/closing the profile modal to prevent stale messages
  - **Better UX**: Users get immediate, actionable feedback right where they're entering their ORCID ID
- **Personal Feed Loading UX Enhancement (v0.1.19)**: Moved progress indicators to top of feed for immediate visibility:
  - **Top-positioned Progress**: Loading indicator now appears at the top of the personal feed instead of at the bottom
  - **Immediate Visibility**: Users can see progress information like "Loading 2/4 queries…" as soon as partial results load
  - **Consistent Styling**: Uses existing `FEED_LOADING_PILL_CLASSES` for visual consistency with other loading states
  - **Better Information Architecture**: Progress information is now where users naturally look first
  - **Improved Progressive Loading**: Progress indicator at top + partial results below creates clear visual hierarchy
- **Console Error Cleanup (v0.1.20)**: Cleaned up console logging to only show technical errors, not user-facing messages:
  - **Smart Error Filtering**: User-facing errors like "ORCID ID not found" no longer clutter the console
  - **Technical Errors Only**: Console still logs genuine technical issues for debugging
  - **Cleaner Development**: Removes noise from console while preserving important error information
  - **Professional Polish**: Error messages appear in UI where users need them, console stays clean
- **Consistent Branding (v0.1.13)**: Fixed branding positioning inconsistency between homepage and login modal:
  - **Login modal branding**: Added "Evidentia" branding to login modal header with consistent styling
  - **Unified positioning**: Both homepage sidebar and login modal now display "Evidentia" in appropriate header positions
  - **Visual consistency**: Uses identical styling (`text-base font-bold uppercase tracking-[0.2em] text-slate-600`) across both contexts
  - **Better UX**: Users now see consistent branding throughout the authentication flow
- **Profile Modal Polish (v0.1.14)**: Enhanced profile settings modal for better spacing and terminology:
  - **Removed top margin**: Eliminated `mt-6` whitespace above ORCID field for tighter, cleaner layout
  - **Consistent terminology**: Changed all instances from "ORCID iD" to "ORCID ID" for proper branding
  - **Updated validation messages**: All error messages now use "ORCID ID" terminology
  - **Improved spacing**: Profile form now starts immediately without unnecessary top padding
- **ORCID Label Refinement (v0.1.15)**: Streamlined ORCID input presentation for cleaner UI:
  - **Removed verbose description**: Eliminated long explanatory text below ORCID input box
  - **Inline keyword hint**: Added concise "(keywords auto-generated)" text next to ORCID ID label
  - **Cleaner layout**: Reduced visual clutter while maintaining essential information about functionality
  - **Better UX**: Users still understand ORCID purpose without overwhelming description text
- **Database Permissions Fix (v0.1.16)**: Resolved profile enrichment API permission errors:
  - **Root cause identified**: RLS policies for `profile_enrichment_jobs` only allowed `auth.uid() = user_id` access, but service role has no `auth.uid()`
  - **Service role usage**: Fixed profile enrichment API to use `supabaseAdmin` client for `profile_enrichment_jobs` operations
  - **RLS policy added**: Created "Service role access for enrichment jobs" policy allowing `auth.role() = 'service_role'` full access
  - **Manual SQL fix**: Added policy via Supabase SQL Editor: `CREATE POLICY "Service role access for enrichment jobs" ON public.profile_enrichment_jobs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');`
  - **API stability**: Profile enrichment workflow now functions correctly with proper database access

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
    ├── supabase/migrations/       # Database schema migrations (v0.1.9 consolidated)
    │   ├── 0001_core_schema.sql           # All essential tables (profiles, search cache, lists, ratings)
    │   ├── 0002_auth_functions.sql        # Auth triggers and helper functions
    │   ├── 0003_permissions.sql           # RLS policies and role permissions
    │   ├── 0004_indexes.sql               # Performance indexes organized by table
    │   └── 0005_rls_performance_fix.sql   # Critical RLS optimization for list performance
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
        │   ├── save-to-list-modal.tsx       # Save papers to lists modal (optimized)
        │   ├── virtual-list.tsx             # Virtual scrolling component for large lists
        │   ├── login-form.tsx               # Login form component
        │   ├── register-form.tsx            # Registration form component
        │   └── ui/message.tsx               # UI message component
        └── lib/
            ├── auth-context.tsx             # Auth state management
            ├── auth-hooks.ts                # Auth utility hooks
            ├── cache-utils.ts               # Enhanced caching with TTL and background refresh
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