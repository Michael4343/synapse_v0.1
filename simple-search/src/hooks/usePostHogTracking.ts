'use client'

import { usePostHog } from '../providers/PostHogProvider'
import { useMemo } from 'react'

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
  const track = (eventName: string, properties?: TrackingProperties) => {
    if (posthog && typeof window !== 'undefined') {
      try {
        posthog.capture(eventName, properties)
      } catch (error) {
        console.warn('PostHog tracking failed:', error)
      }
    }
  }

  // Authentication Events
  const trackSignupAttempted = (method: 'email' | 'google') => {
    track('user_signup_attempted', { signup_method: method })
  }

  const trackSignupCompleted = (userId: string, method: 'email' | 'google') => {
    track('user_signup_completed', { user_id: userId, signup_method: method })
    if (posthog) {
      posthog.identify(userId)
    }
  }

  const trackLoginAttempted = (method: 'email' | 'google') => {
    track('user_login_attempted', { login_method: method })
  }

  const trackLoginCompleted = (userId: string, method: 'email' | 'google') => {
    track('user_login_completed', { user_id: userId, login_method: method })
    if (posthog) {
      posthog.identify(userId)
    }
  }

  const trackLogoutCompleted = () => {
    track('user_logout_completed')
    if (posthog) {
      posthog.reset()
    }
  }

  // Search Events
  const trackSearchQuery = (query: string, resultsCount?: number) => {
    track('search_query_submitted', {
      query,
      query_length: query.length,
      results_count: resultsCount
    })
  }

  const trackSearchResults = (query: string, resultsCount: number, duration?: number) => {
    track('search_results_viewed', {
      query,
      results_count: resultsCount,
      search_duration_ms: duration
    })
  }

  // List Management Events
  const trackListCreated = (listId: string, listName: string) => {
    track('list_created', {
      list_id: listId,
      list_name: listName
    })
  }

  const trackPaperSavedToList = (
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
  }

  // Paper Interaction Events
  const trackPaperClicked = (paperId: string, paperTitle: string, source?: string) => {
    track('paper_clicked', {
      paper_id: paperId,
      paper_title: paperTitle,
      paper_source: source,
      action_type: 'click'
    })
  }

  const trackPaperRated = (paperId: string, paperTitle: string, rating: number) => {
    track('paper_rated', {
      paper_id: paperId,
      paper_title: paperTitle,
      rating,
      action_type: 'rate'
    })
  }

  // Research Events
  const trackResearchCompiled = (query: string, paperCount: number) => {
    track('research_compiled', {
      query,
      paper_count: paperCount
    })
  }

  const trackProfileEnriched = (method: string, success: boolean) => {
    track('profile_enriched', {
      enrichment_method: method,
      success
    })
  }

  // Error Tracking
  const trackError = (errorType: string, errorMessage: string, context?: string) => {
    track('error_occurred', {
      error_type: errorType,
      error_message: errorMessage,
      context,
      timestamp: new Date().toISOString()
    })
  }

  // Page Tracking
  const trackPageView = (pageName: string, pageProperties?: TrackingProperties) => {
    if (posthog) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        page_name: pageName,
        ...pageProperties
      })
    }
  }

  // User Properties
  const setUserProperties = (properties: TrackingProperties) => {
    if (posthog) {
      posthog.people.set(properties)
    }
  }

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
  }), [track, trackPageView, setUserProperties, trackSignupAttempted, trackSignupCompleted, trackLoginAttempted, trackLoginCompleted, trackLogoutCompleted, trackSearchQuery, trackSearchResults, trackListCreated, trackPaperSavedToList, trackPaperClicked, trackPaperRated, trackResearchCompiled, trackProfileEnriched, trackError])
}