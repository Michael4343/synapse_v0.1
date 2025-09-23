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

### Current Directory Structure
```
/synapse v0.1/
├── CLAUDE.md                  # This file - project guidance
├── academic_repos.md          # API availability reference
└── /plan/                     # Stage-based development plan
    ├── README.md              # Plan overview and progress tracking
    ├── stage-1-foundation.md  # Project setup and infrastructure
    ├── stage-2-search-core.md # Basic search implementation
    ├── stage-3-user-interface.md # Frontend and UX
    ├── stage-4-user-features.md # Authentication and saved searches
    ├── stage-5-notifications.md # Email updates system
    ├── stage-6-optimization.md # Performance and multi-API
    └── acceptance-criteria.md  # Testing requirements
```

### Development Approach
**Stage-based development** with clear testing criteria at each stage before progression:

1. **Stage 1: Foundation** - Next.js + Supabase setup with auth
2. **Stage 2: Search Core** - Single API (arXiv) integration
3. **Stage 3: User Interface** - Complete search experience with filters
4. **Stage 4: User Features** - Authentication and saved searches
5. **Stage 5: Notifications** - Email update system
6. **Stage 6: Optimization** - Multi-API integration and performance

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