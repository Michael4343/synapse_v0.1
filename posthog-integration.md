# PostHog Integration Guide - Synapse

## Overview
This document outlines the comprehensive PostHog analytics and session recording integration implemented in the Synapse application for user behaviour tracking and insights.

## Integration Architecture

### Provider Setup
- **PostHogProvider** (`src/providers/PostHogProvider.tsx`): Centralised context provider with 2025 configuration defaults
- **Root Layout Integration** (`src/app/layout.tsx`): App-wide PostHog context availability
- **Custom Hook** (`src/hooks/usePostHogTracking.ts`): Typed tracking methods for all user interactions

### Configuration Features
- **Session Replays Enabled**: Session recording starts on load and restarts after identify/reset so every authenticated session is captured
- **Manual Event Catalog**: Autocapture is disabled; only the curated events below are emitted
- **Host Allowlist**: `NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS` gates uploads to production domains
- **Manual Pageview Control**: Pageviews are captured explicitly inside the provider

## Environment Variables

```bash
# PostHog Analytics Configuration
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-project-api-key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS=research.evidentia.bio
```

## Tracked Events

### Authentication Lifecycle
- `auth_signup_started` – Email or Google signup initiated
- `auth_signup_completed` – Signup succeeds (records provisional `user_id`)
- `auth_login_started` – Sign-in attempt begins
- `auth_login_completed` – Sign-in succeeds and session recording is re-bound to the Supabase user id
- `auth_logout_completed` – User logs out and identity resets

### Profile Personalization
- `profile_keywords_saved` – Research keywords saved or refreshed (flags first-time saves)

### Discovery Flows
- `search_performed` – Manual search executed with result count, duration, sources, and year filter
- `personal_feed_loaded` – Personalized feed (initial or pagination) loaded with result count

### Paper Engagement
- `paper_viewed` – Paper selected from search results, saved lists, or the personal feed
- `paper_saved` – Paper stored in a list (includes list id/name and whether the list was newly created)

### Verification
- `verification_requested` – Verification workflow kicked off for the active paper

### Reliability
- `error_occurred` – User-facing failure with a scoped `domain` and optional context payload

## Event Properties Schema

### Authentication Events
```typescript
{
  method: 'email' | 'google',
  user_id?: string
}
```

### Search & Feed
```typescript
// search_performed
{
  query: string,
  results_count: number,
  duration_ms?: number,
  sources: Array<'research' | 'patents'>,
  year_filter?: number | null
}

// personal_feed_loaded
{
  results_count: number,
  load_more: boolean
}
```

### Paper Interaction
```typescript
// paper_viewed
{
  paper_id: string,
  paper_title: string,
  source?: string | null,
  via: 'search_result' | 'list' | 'personal_feed'
}

// paper_saved
{
  paper_id: string,
  paper_title: string,
  list_id: string,
  list_name: string,
  created_list: boolean
}
```

### Personalization & Verification
```typescript
// profile_keywords_saved
{
  keyword_count: number,
  first_save: boolean
}

// verification_requested
{
  paper_id: string,
  verification_type: string,
  source?: string | null
}
```

### Error Reporting
```typescript
{
  domain: string,
  message: string,
  context?: string
}
```

## Implementation Details

### Session Recording Configuration
```typescript
session_recording: {
  maskAllInputs: false, // Full recording for prototype insights
  recordCrossOriginIframes: true,
}
```

### User Identification Strategy
- **PostHog Identity**: Supabase user ID used for cross-session tracking
- **Session Recording Refresh**: Recording restarts after `identify` and `reset` so replays span each real session
- **Privacy Compliance**: No sensitive data captured in events

### Performance Optimisations
- **Client-Side Only**: All tracking happens in browser components
- **Lazy Loading**: PostHog initialised after component mount
- **Manual Instrumentation**: Autocapture disabled; only the events above are emitted
- **Error Boundaries**: Tracking failures don't impact app functionality

## Usage Examples

### Basic Event Tracking
```typescript
import { usePostHogTracking } from '@/hooks/usePostHogTracking'

const { trackEvent, trackError } = usePostHogTracking()

trackEvent({
  name: 'search_performed',
  properties: {
    query: 'gene therapy manufacturing',
    results_count: 18,
    duration_ms: 420,
    sources: ['research'],
  }
})

trackError('search', 'LLM enrichment failed', 'handleKeywordSearch')
```

## Data Privacy & Compliance

### Data Collection Principles
- **Prototype Focus**: Maximum data collection for early insights
- **No PII**: Personal identifiable information excluded from events
- **Behavioural Analytics**: Focus on user journey and content interaction patterns
- **Transparent Tracking**: All events clearly documented

### Session Recording Scope
- **Full UI Capture**: Complete user interface interactions
- **No Input Masking**: Prototype environment with non-sensitive data
- **Cross-Origin Support**: Comprehensive iframe and embed tracking

## Dashboard & Analytics

### Key Metrics Tracked
1. **User Acquisition**: Signup conversion rates and authentication patterns
2. **Onboarding Efficiency**: Profile generation completion rates and duration
3. **Content Discovery**: Feed interaction patterns and research breakthrough identification
4. **Technical Performance**: API response times and error rates

### Research-Specific Insights
- **Content Relevance**: Which research categories drive highest engagement
- **Discovery Patterns**: How users interact with breakthrough vs routine content
- **Profile Quality Impact**: Correlation between profile completeness and feed engagement

## Development Notes

### 2025 PostHog Features Used
- **Latest Configuration Defaults**: Optimised for modern web applications
- **Session Replay Enhancements**: Utilises the 2025 recording pipeline with cross-origin support
- **Performance Monitoring**: Built-in web vitals tracking
- **React 18+ Support**: Full compatibility with React concurrent features

### Integration Best Practices
- **Hook-Based Architecture**: Consistent tracking interface across components
- **Error Resilience**: Tracking failures don't impact user experience
- **Performance First**: Minimal bundle size impact with lazy initialisation
- **TypeScript Safety**: Full type definitions for all tracking methods

## Future Enhancements

### Planned Features
- **A/B Testing**: PostHog feature flags for research feed experiments
- **Cohort Analysis**: Research field and institution-based user segmentation
- **Custom Dashboards**: Research-specific analytics views
- **API Performance Monitoring**: Enhanced backend operation tracking

### Privacy Evolution
- **Consent Management**: User-controlled tracking preferences
- **Data Retention**: Configurable session recording retention periods
- **GDPR Compliance**: Enhanced privacy controls for production deployment

## Troubleshooting

### Common Issues
- **Environment Variables**: Ensure PostHog keys are properly configured
- **Session Recording**: Check browser developer tools for PostHog initialisation
- **Event Validation**: Use PostHog dashboard live events view for debugging

### Development Testing
```bash
# Check PostHog initialisation
console.log('PostHog loaded:', window.posthog !== undefined)

# Test event capture
tracking.trackError('test_event', 'Testing PostHog integration')
```

---

*Last Updated: September 15, 2025*
*PostHog Version: 1.266.0*
*Configuration: 2025-05-24 defaults*
