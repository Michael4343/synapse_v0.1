'use client'

import { useCallback, useMemo } from 'react'
import { usePostHog } from '../providers/PostHogProvider'

type AuthMethod = 'email' | 'google'

type AppEvent =
  | {
      name: 'auth_signup_started'
      properties: {
        method: AuthMethod
      }
    }
  | {
      name: 'auth_signup_completed'
      properties: {
        method: AuthMethod
        user_id: string
      }
    }
  | {
      name: 'auth_login_started'
      properties: {
        method: AuthMethod
      }
    }
  | {
      name: 'auth_login_completed'
      properties: {
        method: AuthMethod
        user_id: string
      }
    }
  | {
      name: 'auth_logout_completed'
      properties?: {
        user_id?: string | null
      }
    }
  | {
      name: 'profile_keywords_saved'
      properties: {
        keyword_count: number
        first_save: boolean
      }
    }
  | {
      name: 'search_performed'
      properties: {
        query: string
        results_count: number
        duration_ms?: number
        sources: ('research' | 'patents')[]
        year_filter?: number | null
      }
    }
  | {
      name: 'personal_feed_loaded'
      properties: {
        results_count: number
        load_more: boolean
      }
    }
  | {
      name: 'paper_viewed'
      properties: {
        paper_id: string
        paper_title: string
        source?: string | null
        via: 'search_result' | 'list' | 'personal_feed'
      }
    }
  | {
      name: 'paper_saved'
      properties: {
        paper_id: string
        paper_title: string
        list_id: string
        list_name: string
        created_list: boolean
      }
    }
  | {
      name: 'verification_requested'
      properties: {
        paper_id: string
        verification_type: string
        source?: string | null
      }
    }
  | {
      name: 'error_occurred'
      properties: {
        domain: string
        message: string
        context?: string
      }
    }
  | {
      name: 'onboarding_completed'
      properties: {
        keyword_count: number
        time_to_complete_seconds?: number
      }
    }
  | {
      name: 'research_compile_requested'
      properties: {
        paper_id: string
        paper_title: string
        source?: string | null
      }
    }
  | {
      name: 'paper_time_spent'
      properties: {
        duration_seconds: number
        paper_id: string
        paper_title: string
        source?: string | null
      }
    }

export function usePostHogTracking() {
  const { posthog, restartSessionRecording } = usePostHog()

  const trackEvent = useCallback(
    (event: AppEvent) => {
      if (!posthog || typeof window === 'undefined') {
        return
      }

      try {
        posthog.capture(event.name, event.properties)
      } catch (error) {
        console.warn('PostHog track failed', error)
      }
    },
    [posthog]
  )

  const trackError = useCallback(
    (domain: string, message: string, context?: string) => {
      trackEvent({
        name: 'error_occurred',
        properties: {
          domain,
          message,
          context,
        },
      })
    },
    [trackEvent]
  )

  const identifyUser = useCallback(
    (userId: string, userProperties?: Record<string, any>) => {
      if (!posthog) return

      posthog.identify(userId, userProperties)
      restartSessionRecording?.()
    },
    [posthog, restartSessionRecording]
  )

  const resetUser = useCallback(() => {
    if (!posthog) return

    posthog.reset()
    restartSessionRecording?.()
  }, [posthog, restartSessionRecording])

  return useMemo(
    () => ({
      trackEvent,
      trackError,
      identifyUser,
      resetUser,
    }),
    [identifyUser, resetUser, trackError, trackEvent]
  )
}
