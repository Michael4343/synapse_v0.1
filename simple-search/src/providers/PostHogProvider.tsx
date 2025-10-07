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
      })

      startSessionRecording(ph)

      if (process.env.NODE_ENV === 'development') {
        ph.debug()
      }

      loadedInstance = ph
      setPosthogInstance(ph)
    }

    initPostHog()

    return () => {
      isCancelled = true
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
