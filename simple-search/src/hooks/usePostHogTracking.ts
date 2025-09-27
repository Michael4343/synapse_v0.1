'use client'

import { usePostHog } from '../providers/PostHogProvider'
import { useMemo, useCallback } from 'react'

export interface TrackingProperties {
  [key: string]: any
}

export interface AuthenticationProperties {
  signup_method?: 'email' | 'google'
  login_method?: 'email' | 'google'
  user_id?: string
}

export interface SearchProperties {
  query?: string
  query_length?: number
  results_count?: number
  search_duration_ms?: number
}

export interface ListProperties {
  list_id?: string
  list_name?: string
  list_item_count?: number
  paper_id?: string
  paper_title?: string
}

export interface ErrorProperties {
  error_type?: string
  error_message?: string
  context?: string
  stack_trace?: string
}

export interface PaperInteractionProperties {
  paper_id?: string
  paper_title?: string
  paper_source?: string
  paper_year?: number
  action_type?: 'view' | 'click' | 'save' | 'rate'
}

export function usePostHogTracking() {
  const { posthog } = usePostHog()

  // Helper function to safely track events
  const track = useCallback((eventName: string, properties?: TrackingProperties) => {
    if (posthog && typeof window !== 'undefined') {
      try {
        posthog.capture(eventName, properties)
      } catch (error) {
        console.warn('PostHog tracking failed:', error)
      }
    }
  }, [posthog])

  // Authentication Events
  const trackSignupAttempted = useCallback((method: 'email' | 'google') => {
    track('user_signup_attempted', { signup_method: method })
  }, [track])

  const trackSignupCompleted = useCallback((userId: string, method: 'email' | 'google') => {
    track('user_signup_completed', { user_id: userId, signup_method: method })
    if (posthog) {
      posthog.identify(userId)
    }
  }, [track, posthog])

  const trackLoginAttempted = useCallback((method: 'email' | 'google') => {
    track('user_login_attempted', { login_method: method })
  }, [track])

  const trackLoginCompleted = useCallback((userId: string, method: 'email' | 'google') => {
    track('user_login_completed', { user_id: userId, login_method: method })
    if (posthog) {
      posthog.identify(userId)
    }
  }, [track, posthog])

  const trackLogoutCompleted = useCallback(() => {
    track('user_logout_completed')
    if (posthog) {
      posthog.reset()
    }
  }, [track, posthog])

  // Search Events
  const trackSearchQuery = useCallback((query: string, resultsCount?: number) => {
    track('search_query_submitted', {
      query,
      query_length: query.length,
      results_count: resultsCount
    })
  }, [track])

  const trackSearchResults = useCallback((query: string, resultsCount: number, duration?: number) => {
    track('search_results_viewed', {
      query,
      results_count: resultsCount,
      search_duration_ms: duration
    })
  }, [track])

  // List Management Events
  const trackListCreated = useCallback((listId: string, listName: string) => {
    track('list_created', {
      list_id: listId,
      list_name: listName
    })
  }, [track])

  const trackPaperSavedToList = useCallback((
    paperId: string,
    paperTitle: string,
    listId: string,
    listName: string
  ) => {
    track('paper_saved_to_list', {
      paper_id: paperId,
      paper_title: paperTitle,
      list_id: listId,
      list_name: listName
    })
  }, [track])

  // Paper Interaction Events
  const trackPaperClicked = useCallback((paperId: string, paperTitle: string, source?: string) => {
    track('paper_clicked', {
      paper_id: paperId,
      paper_title: paperTitle,
      paper_source: source,
      action_type: 'click'
    })
  }, [track])

  const trackPaperRated = useCallback((paperId: string, paperTitle: string, rating: number) => {
    track('paper_rated', {
      paper_id: paperId,
      paper_title: paperTitle,
      rating,
      action_type: 'rate'
    })
  }, [track])

  // Research Events
  const trackResearchCompiled = useCallback((query: string, paperCount: number) => {
    track('research_compiled', {
      query,
      paper_count: paperCount
    })
  }, [track])

  const trackProfileEnriched = useCallback((method: string, success: boolean) => {
    track('profile_enriched', {
      enrichment_method: method,
      success
    })
  }, [track])

  // Error Tracking
  const trackError = useCallback((errorType: string, errorMessage: string, context?: string) => {
    track('error_occurred', {
      error_type: errorType,
      error_message: errorMessage,
      context,
      timestamp: new Date().toISOString()
    })
  }, [track])

  // Page Tracking
  const trackPageView = useCallback((pageName: string, pageProperties?: TrackingProperties) => {
    if (posthog) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        page_name: pageName,
        ...pageProperties
      })
    }
  }, [posthog])

  // User Properties
  const setUserProperties = useCallback((properties: TrackingProperties) => {
    if (posthog) {
      posthog.people.set(properties)
    }
  }, [posthog])

  return useMemo(() => ({
    // Core tracking
    track,
    trackPageView,
    setUserProperties,

    // Authentication
    trackSignupAttempted,
    trackSignupCompleted,
    trackLoginAttempted,
    trackLoginCompleted,
    trackLogoutCompleted,

    // Search
    trackSearchQuery,
    trackSearchResults,

    // Lists
    trackListCreated,
    trackPaperSavedToList,

    // Paper interactions
    trackPaperClicked,
    trackPaperRated,

    // Research
    trackResearchCompiled,
    trackProfileEnriched,

    // Error tracking
    trackError
  }), [])
}