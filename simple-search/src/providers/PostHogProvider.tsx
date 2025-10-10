'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { PostHog } from 'posthog-js'

type PostHogWithSessionRecording = PostHog & {
  startSessionRecording?: () => void
  shutdown?: () => void
  sessionRecording?: {
    startRecording?: () => void
    stopRecording?: () => void
  }
}

interface PostHogContextType {
  posthog: PostHog | null
  restartSessionRecording: (() => void) | null
}

const PostHogContext = createContext<PostHogContextType>({
  posthog: null,
  restartSessionRecording: null,
})

export function usePostHog() {
  return useContext(PostHogContext)
}

interface PostHogProviderProps {
  children: ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = useMemo(() => searchParams?.toString() ?? '', [searchParams])
  const pageKey = useMemo(() => {
    if (!pathname) return ''
    return search ? `${pathname}?${search}` : pathname
  }, [pathname, search])

  const [posthogInstance, setPosthogInstance] = useState<PostHogWithSessionRecording | null>(null)

  const startSessionRecording = (instance: PostHogWithSessionRecording) => {
    if (typeof instance.sessionRecording?.stopRecording === 'function') {
      instance.sessionRecording.stopRecording()
    }

    if (typeof instance.sessionRecording?.startRecording === 'function') {
      instance.sessionRecording.startRecording()
    } else if (typeof instance.startSessionRecording === 'function') {
      instance.startSessionRecording()
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
    const allowedHosts = (process.env.NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS || 'research.evidentia.bio')
      .split(',')
      .map(host => host.trim())
      .filter(Boolean)
    const currentHost = window.location.hostname

    const isHostAllowed = allowedHosts.length === 0 || allowedHosts.includes(currentHost)

    if (!isHostAllowed) {
      console.info(`PostHog disabled on host: ${currentHost}`)
      return
    }

    if (!apiKey || apiKey === 'your-posthog-project-api-key') {
      console.warn('PostHog key not configured; analytics disabled')
      return
    }

    let isCancelled = false
    let loadedInstance: PostHogWithSessionRecording | null = null

    // Store original console methods for preservation
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn

    const initPostHog = async () => {
      const { default: posthog } = await import('posthog-js')
      const ph = posthog as PostHogWithSessionRecording

      if (isCancelled) return

      ph.init(apiKey, {
        api_host: apiHost,
        autocapture: false,
        capture_pageview: false,
        person_profiles: 'identified_only',
        session_recording: {
          maskAllInputs: false,
          recordCrossOriginIframes: true,
        },
        capture_exceptions: true, // Enable automatic exception capture
        before_send: (event) => {
          // Enrich all events with additional context
          if (event && typeof event === 'object') {
            event.properties = event.properties || {}

            // Add environment context
            event.properties.$environment = process.env.NODE_ENV || 'production'
            event.properties.$page_path = window.location.pathname
            event.properties.$page_url = window.location.href
            event.properties.$user_agent = navigator.userAgent

            // Add viewport info for UI-related errors
            if (event.event === '$exception') {
              event.properties.$viewport_width = window.innerWidth
              event.properties.$viewport_height = window.innerHeight
            }
          }
          return event
        },
      })

      startSessionRecording(ph)

      if (process.env.NODE_ENV === 'development') {
        ph.debug()
      }

      // Intercept console.error and console.warn to send to PostHog
      console.error = (...args: any[]) => {
        originalConsoleError(...args)

        try {
          const errorMessage = args
            .map(arg => {
              if (arg instanceof Error) return arg.message
              if (typeof arg === 'object') return JSON.stringify(arg)
              return String(arg)
            })
            .join(' ')

          const errorObj = args.find(arg => arg instanceof Error)

          ph.capture('console_error', {
            message: errorMessage,
            stack: errorObj?.stack,
            arguments: args.map(arg => {
              if (arg instanceof Error) return { name: arg.name, message: arg.message }
              if (typeof arg === 'object') {
                try {
                  return JSON.parse(JSON.stringify(arg))
                } catch {
                  return String(arg)
                }
              }
              return arg
            }),
          })
        } catch (e) {
          // Silently fail if PostHog capture fails - don't break console.error
          originalConsoleError('PostHog console.error capture failed:', e)
        }
      }

      console.warn = (...args: any[]) => {
        originalConsoleWarn(...args)

        try {
          const warnMessage = args
            .map(arg => {
              if (typeof arg === 'object') return JSON.stringify(arg)
              return String(arg)
            })
            .join(' ')

          ph.capture('console_warn', {
            message: warnMessage,
            arguments: args.map(arg => {
              if (typeof arg === 'object') {
                try {
                  return JSON.parse(JSON.stringify(arg))
                } catch {
                  return String(arg)
                }
              }
              return arg
            }),
          })
        } catch (e) {
          // Silently fail if PostHog capture fails
          originalConsoleWarn('PostHog console.warn capture failed:', e)
        }
      }

      loadedInstance = ph
      setPosthogInstance(ph)
    }

    initPostHog()

    return () => {
      isCancelled = true

      // Restore original console methods on cleanup
      console.error = originalConsoleError
      console.warn = originalConsoleWarn

      if (loadedInstance?.shutdown) {
        loadedInstance.shutdown()
      }
    }
  }, [])

  useEffect(() => {
    if (!posthogInstance) return
    if (typeof window === 'undefined') return
    if (!pageKey) return

    posthogInstance.capture('$pageview', {
      $current_url: window.location.href,
      page_path: pathname,
      page_title: document.title,
      search,
    })
  }, [posthogInstance, pageKey, pathname, search])

  const restartSessionRecording = useMemo<(() => void) | null>(() => {
    if (!posthogInstance) return null
    return () => startSessionRecording(posthogInstance)
  }, [posthogInstance])

  const value = useMemo(() => ({
    posthog: posthogInstance,
    restartSessionRecording,
  }), [posthogInstance, restartSessionRecording])

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  )
}
