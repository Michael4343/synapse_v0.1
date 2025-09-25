# PostHog Integration Guide - Synapse

## Overview
This document outlines the comprehensive PostHog analytics and session recording integration implemented in the Synapse application for user behaviour tracking and insights.

## Integration Architecture

### Provider Setup
- **PostHogProvider** (`src/providers/PostHogProvider.tsx`): Centralised context provider with 2025 configuration defaults
- **Root Layout Integration** (`src/app/layout.tsx`): App-wide PostHog context availability
- **Custom Hook** (`src/hooks/usePostHogTracking.ts`): Typed tracking methods for all user interactions

### Configuration Features
- **2025 Defaults**: Latest PostHog configuration snapshot (`defaults: '2025-05-24'`)
- **Full Session Recording**: Complete user session capture for prototype insights
- **Autocapture Events**: Comprehensive DOM interaction tracking
- **Manual Pageview Control**: Strategic pageview capture with page type categorisation

## Environment Variables

```bash
# PostHog Analytics Configuration
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-project-api-key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## Tracked Events

### Authentication Flow
- `user_signup_attempted` - User initiates signup process
- `user_signup_completed` - Successful account creation with user identification
- `user_login_attempted` - User initiates login process
- `user_login_completed` - Successful authentication with user identification
- `user_logout_completed` - User logout with session reset

### Onboarding Journey
- `onboarding_started` - User enters onboarding flow
- `onboarding_url_submitted` - Profile URL submission with type classification
- `profile_generation_started` - AI profile generation initiated
- `profile_generation_completed` - Profile generation completed with duration metrics
- `onboarding_completed` - Full onboarding process completion

### Feed Interactions
- `feed_refresh_clicked` - Manual feed regeneration triggered
- `feed_refresh_completed` - Feed refresh completed with performance metrics
- `feed_item_clicked` - User clicks on feed item with content metadata
- `feed_category_viewed` - Category interaction with item count metrics

### Research Analytics
- `research_discovery_identified` - Discovery of breakthrough content
- `content_engagement` - Deep content interaction tracking

### Error Tracking
- `error_occurred` - Comprehensive error capture with context

## Event Properties Schema

### User Events
```typescript
// Authentication
{
  signup_method: 'email' | 'google',
  login_method: 'email' | 'google',
  user_id: string
}

// URL Submission
{
  submitted_url: string,
  url_type: 'linkedin' | 'google_scholar' | 'orcid' | 'other',
  url_domain: string
}

// Performance Metrics
{
  generation_duration_ms: number,
  profile_text_length: number,
  feed_item_count: number,
  feed_categories: string[]
}
```

### Content Tracking
```typescript
// Feed Interactions
{
  item_id: string,
  item_type: 'breakthrough_publications' | 'emerging_technologies' | 'strategic_funding' | 'field_intelligence',
  item_title: string,
  item_source: string,
  category_type: string,
  category_item_count: number
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
- **Session Management**: Automatic identity reset on logout
- **Privacy Compliance**: No sensitive data captured in events

### Performance Optimisations
- **Client-Side Only**: All tracking happens in browser components
- **Lazy Loading**: PostHog initialised after component mount
- **Error Boundaries**: Tracking failures don't impact app functionality

## Usage Examples

### Basic Event Tracking
```typescript
import { usePostHogTracking } from '@/hooks/usePostHogTracking'

const tracking = usePostHogTracking()

// Track user action
tracking.trackFeedItemClicked(itemId, itemType, title, source)

// Track performance
tracking.trackProfileGenerationCompleted(durationMs, profileLength)

// Track errors
tracking.trackError('api_failure', errorMessage, { context: 'feed_generation' })
```

### Advanced Research Analytics
```typescript
// Research discovery tracking
tracking.trackResearchDiscovery('breakthrough_paper')

// Content engagement depth
tracking.trackContentEngagement('time_spent', {
  duration_seconds: 45,
  item_type: 'publication'
})
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
- **Enhanced Autocapture**: Improved DOM event detection
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