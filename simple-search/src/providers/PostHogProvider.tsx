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
  sessionRecording?: {
    startRecording?: () => void
  }
}

interface PostHogContextType {
  posthog: PostHog | null
}

const PostHogContext = createContext<PostHogContextType>({ posthog: null })

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

  const [posthogInstance, setPosthogInstance] = useState<PostHog | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
    const allowedHosts = ['research.evidentia.bio']
    const currentHost = window.location.hostname

    if (!allowedHosts.includes(currentHost)) {
      console.info(`PostHog disabled on host: ${currentHost}`)
      return
    }

    if (!apiKey || apiKey === 'your-posthog-project-api-key') {
      console.warn('PostHog key not configured; analytics disabled')
      return
    }

    let isCancelled = false
    let loadedInstance: PostHog | null = null

    const initPostHog = async () => {
      const { default: posthog } = await import('posthog-js')
      const ph = posthog as PostHogWithSessionRecording

      if (isCancelled) return

      ph.init(apiKey, {
        api_host: apiHost,
        autocapture: true,
        capture_pageview: false,
        person_profiles: 'identified_only',
        session_recording: {
          maskAllInputs: false,
          recordCrossOriginIframes: true,
        },
      })

      if (typeof ph.startSessionRecording === 'function') {
        ph.startSessionRecording()
      } else if (ph.sessionRecording?.startRecording) {
        ph.sessionRecording.startRecording()
      }

      if (process.env.NODE_ENV === 'development') {
        ph.debug()
      }

      loadedInstance = ph
      setPosthogInstance(ph)
    }

    initPostHog()

    return () => {
      isCancelled = true
      if (loadedInstance) {
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

  const value = useMemo(() => ({
    posthog: posthogInstance,
  }), [posthogInstance])

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  )
}
