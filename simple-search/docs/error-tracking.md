# Error Tracking Documentation - Evidentia

## Overview

Evidentia uses PostHog for comprehensive error tracking and monitoring across the entire application. This document outlines the error tracking implementation, usage patterns, and best practices.

## Architecture

### 1. Automatic Exception Capture

**Configuration:** `src/providers/PostHogProvider.tsx`

PostHog is configured with automatic exception capture that monitors:
- `window.onerror` - Catches uncaught JavaScript errors
- `window.onunhandledrejection` - Catches unhandled promise rejections

```typescript
ph.init(apiKey, {
  capture_exceptions: true, // Enable automatic exception capture
  before_send: (event) => {
    // Enrich all events with context
    event.properties.$environment = process.env.NODE_ENV || 'production'
    event.properties.$page_path = window.location.pathname
    event.properties.$user_agent = navigator.userAgent
    return event
  },
})
```

**What gets captured automatically:**
- Uncaught exceptions
- Unhandled promise rejections
- Network errors
- Script loading errors

### 2. Console Error Interception

**Location:** `src/providers/PostHogProvider.tsx`

Console errors and warnings are automatically intercepted and sent to PostHog while preserving the original console behavior.

```typescript
console.error = (...args: any[]) => {
  originalConsoleError(...args) // Preserve original behavior

  // Send to PostHog
  ph.capture('console_error', {
    message: errorMessage,
    stack: errorObj?.stack,
    arguments: serializedArgs,
  })
}
```

**Events captured:**
- `console_error` - All console.error() calls
- `console_warn` - All console.warn() calls

**Benefits:**
- Zero code changes required in existing error handling
- Automatic stack trace capture
- Full argument serialization
- Non-breaking fallback if PostHog fails

### 3. React Error Boundary

**Component:** `src/components/error-boundary.tsx`
**Usage:** Wraps entire app in `src/app/layout.tsx`

Catches React component rendering errors and provides graceful fallback UI.

```typescript
<ErrorBoundary>
  <AuthProvider>
    {children}
  </AuthProvider>
</ErrorBoundary>
```

**What gets captured:**
- React component lifecycle errors
- Rendering errors
- Event handler errors in components
- Component stack traces

**Event name:** `react_error_boundary`

**Properties:**
```typescript
{
  error_name: string
  error_message: string
  error_stack: string
  component_stack: string
  page_path: string
}
```

### 4. Manual Exception Capture

**Hook:** `src/hooks/usePostHogTracking.ts`

For explicit error reporting in try/catch blocks.

```typescript
import { usePostHogTracking } from '@/hooks/usePostHogTracking'

const { captureException } = usePostHogTracking()

try {
  // risky operation
} catch (error) {
  captureException(error as Error, {
    operation: 'data_sync',
    user_action: 'save_profile',
  })
}
```

**API:**
```typescript
captureException(
  error: Error,
  additionalProperties?: Record<string, any>
): void
```

## Error Event Types

### Automatic Events

| Event Name | Source | Properties |
|-----------|--------|-----------|
| `$exception` | window.onerror, unhandledrejection | type, message, stack, environment, page_path |
| `console_error` | console.error() | message, stack, arguments |
| `console_warn` | console.warn() | message, arguments |
| `react_error_boundary` | React Error Boundary | error_name, error_message, component_stack |

### Manual Events

| Event Name | Source | Usage |
|-----------|--------|-------|
| `error_occurred` | trackError() | Legacy - prefer captureException() |
| `$exception` | captureException() | Recommended for manual error reporting |

## Context Enrichment

All errors automatically include:

```typescript
{
  $environment: 'development' | 'production'
  $page_path: '/papers/123'
  $page_url: 'https://research.evidentia.bio/papers/123'
  $user_agent: 'Mozilla/5.0...'
  $viewport_width: 1920  // For $exception events only
  $viewport_height: 1080 // For $exception events only
}
```

## Usage Patterns

### 1. API Route Error Handling

```typescript
// src/app/api/example/route.ts
import { usePostHogTracking } from '@/hooks/usePostHogTracking'

export async function POST(request: NextRequest) {
  try {
    const result = await fetchExternalAPI()
    return NextResponse.json(result)
  } catch (error) {
    console.error('External API failed', error) // Automatically captured
    return NextResponse.json(
      { error: 'Service unavailable' },
      { status: 502 }
    )
  }
}
```

**Note:** Using `console.error` is sufficient - it's automatically captured with full context.

### 2. Component Error Handling

```typescript
// src/components/example.tsx
import { usePostHogTracking } from '@/hooks/usePostHogTracking'

export function ExampleComponent() {
  const { captureException } = usePostHogTracking()

  const handleSubmit = async () => {
    try {
      await submitData()
    } catch (error) {
      // Manual capture for additional context
      captureException(error as Error, {
        component: 'ExampleComponent',
        action: 'submit',
        user_input: formData.title,
      })

      setError('Failed to submit')
    }
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

### 3. Async Operations

```typescript
// Unhandled rejections are automatically captured
async function fetchData() {
  const response = await fetch('/api/data')

  if (!response.ok) {
    throw new Error('API request failed') // Automatically captured
  }

  return response.json()
}
```

### 4. Custom Error Context

```typescript
const { captureException } = usePostHogTracking()

try {
  await processPayment(userId, amount)
} catch (error) {
  captureException(error as Error, {
    domain: 'payments',
    user_id: userId,
    amount: amount,
    payment_method: 'stripe',
    severity: 'critical',
  })

  throw error // Re-throw for UI handling
}
```

## PostHog Dashboard

### Accessing Errors

1. **Error Tracking Tab:** Navigate to PostHog → Error Tracking
2. **Event Explorer:** Filter by event name:
   - `$exception`
   - `console_error`
   - `console_warn`
   - `react_error_boundary`

### Key Metrics

**Error Rate:**
```
Event: $exception
Math: Count unique sessions with error / Total sessions
Time: Daily
```

**Most Common Errors:**
```
Event: $exception
Breakdown by: $exception_message
Sort by: Count descending
Limit: 10
```

**Error by Page:**
```
Event: $exception
Breakdown by: $page_path
Visualization: Bar chart
```

### Setting Up Alerts

1. Navigate to **Insights** → **New Alert**
2. Select event: `$exception`
3. Condition: Count > 10 in 1 hour
4. Destination: Slack channel #alerts-production
5. Save alert

## Best Practices

### DO ✅

1. **Let automatic capture work** - Most errors are caught automatically
2. **Use console.error for API errors** - It's captured with full context
3. **Add context with captureException** - When you need custom properties
4. **Test error boundaries** - Verify fallback UI works correctly
5. **Monitor error trends** - Set up PostHog dashboards and alerts

### DON'T ❌

1. **Don't swallow errors silently** - Always log or report
2. **Don't over-report** - Trust automatic capture for most cases
3. **Don't include PII** - Avoid capturing passwords, tokens, emails
4. **Don't report expected validation errors** - Only unexpected failures
5. **Don't break on PostHog failure** - Error tracking is non-blocking

### When to Use Manual Capture

Use `captureException()` when:
- You need additional business context
- Error happens in a critical user flow
- You want to track error severity
- You need to correlate with user actions

Use automatic capture for:
- Unexpected JavaScript errors
- API failures (use console.error)
- React rendering errors
- Network failures

## Development vs Production

### Development Mode

**Console intercept:** Enabled - errors appear in browser console AND PostHog
**Error boundary:** Shows detailed error information
**PostHog debug:** Enabled via `ph.debug()`

### Production Mode

**Console intercept:** Enabled - errors sent to PostHog
**Error boundary:** Shows friendly fallback UI
**PostHog debug:** Disabled
**Burst protection:** Automatic to prevent error loops

## Troubleshooting

### Errors not appearing in PostHog

1. Check `NEXT_PUBLIC_POSTHOG_KEY` is set
2. Verify `NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS` includes your domain
3. Check browser console for "PostHog" messages
4. Verify PostHog is initialized: `window.posthog !== undefined`

### Console errors duplicated

This is expected - errors appear in:
- Browser console (for debugging)
- PostHog (for monitoring)

### Testing error tracking

```typescript
// Trigger automatic capture
throw new Error('Test error')

// Trigger console capture
console.error('Test console error', { context: 'test' })

// Trigger error boundary
const BrokenComponent = () => {
  throw new Error('Test React error')
  return <div>Never rendered</div>
}

// Trigger manual capture
const { captureException } = usePostHogTracking()
captureException(new Error('Test manual error'), { test: true })
```

## Session Replay Integration

Errors are automatically linked to session replays in PostHog:

1. Click on any error in PostHog
2. View "Related Session Recordings"
3. Watch exact user actions leading to error
4. See network requests, console logs, UI state

This provides full context for debugging production issues.

## Privacy & Compliance

### Data Collected

- Error messages and stack traces
- Page URLs and paths
- User agent strings
- Component stack traces
- Custom properties you add

### Data NOT Collected

- User passwords or credentials
- Payment information
- Personal identifiable information (unless explicitly added)
- Form input values (masked in session recordings)

### Retention

- Error events: 90 days (configurable in PostHog)
- Session recordings: 30 days (configurable in PostHog)

## Migration from Legacy trackError

Old pattern:
```typescript
trackError('domain', 'message', 'context')
```

New pattern:
```typescript
captureException(error, { domain: 'domain', context: 'context' })
```

The old `trackError` method still works but is deprecated. Migrate to `captureException` for:
- Better PostHog integration
- Automatic error grouping
- Stack trace capture
- Session replay linking

## Summary

Evidentia's error tracking provides:
- ✅ Automatic capture of all JavaScript errors
- ✅ Console error/warning forwarding
- ✅ React error boundary with fallback UI
- ✅ Manual exception reporting API
- ✅ Full context enrichment
- ✅ Session replay integration
- ✅ Non-blocking, production-ready monitoring

All errors are automatically sent to PostHog with rich context, making it easy to identify, debug, and fix issues in production.

---

*Last Updated: 2025-10-10*
*Version: 0.2.0 - Beta Launch Ready*
