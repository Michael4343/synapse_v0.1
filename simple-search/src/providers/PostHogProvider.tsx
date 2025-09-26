'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface PostHogContextType {
  posthog: any | null
}

const PostHogContext = createContext<PostHogContextType>({ posthog: null })

export function usePostHog() {
  return useContext(PostHogContext)
}

interface PostHogProviderProps {
  children: ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const [posthogInstance, setPosthogInstance] = useState<any>(null)

  useEffect(() => {
    // Only initialize PostHog in production environments
    const isProduction = process.env.NODE_ENV === 'production' &&
                        typeof window !== 'undefined' &&
                        !window.location.hostname.includes('localhost')

    if (isProduction &&
        process.env.NEXT_PUBLIC_POSTHOG_KEY &&
        process.env.NEXT_PUBLIC_POSTHOG_HOST &&
        process.env.NEXT_PUBLIC_POSTHOG_KEY !== 'your-posthog-project-api-key') {

      // Dynamic import to avoid server-side issues
      import('posthog-js').then((posthogModule) => {
        const posthog = posthogModule.default
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          person_profiles: 'identified_only',
          // 2025 configuration defaults for optimal performance
          defaults: '2025-05-24',
          // Full session recording for prototype insights
          session_recording: {
            maskAllInputs: false,
            recordCrossOriginIframes: true,
          },
          // Comprehensive autocapture for user interaction tracking
          autocapture: true,
          // Manual pageview control for strategic tracking
          capture_pageview: false,
          // Disable debug mode in production
          loaded: (ph) => {
            if (process.env.NODE_ENV === 'development') ph.debug()
          }
        })
        setPosthogInstance(posthog)
      })
    }
  }, [])

  const value: PostHogContextType = {
    posthog: posthogInstance
  }

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  )
}