'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { createClient } from './supabase'
import { usePostHogTracking } from '../hooks/usePostHogTracking'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const { trackEvent, trackError, identifyUser, resetUser } = usePostHogTracking()

  // Helper to identify user with person properties
  const identifyUserWithProperties = useCallback(async (userId: string, userEmail?: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('orcid_id, profile_personalization, created_at')
        .eq('id', userId)
        .single()

      const personalization = profile?.profile_personalization as any
      const manualKeywords = personalization?.manual_keywords || []

      const userProperties: Record<string, any> = {
        keyword_count: manualKeywords.length,
        has_orcid: !!profile?.orcid_id,
        signup_date: profile?.created_at || new Date().toISOString()
      }

      // Add email if available - PostHog uses $email to display in dashboard
      if (userEmail) {
        userProperties.$email = userEmail
        userProperties.email = userEmail
      }

      identifyUser(userId, userProperties)
    } catch (error) {
      // Fallback to basic identification if profile fetch fails
      const fallbackProperties: Record<string, any> = {}
      if (userEmail) {
        fallbackProperties.$email = userEmail
        fallbackProperties.email = userEmail
      }
      identifyUser(userId, Object.keys(fallbackProperties).length > 0 ? fallbackProperties : undefined)
    }
  }, [identifyUser, supabase])

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error getting session:', error)
        } else {
          setSession(session)
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Handle successful sign in (especially for Google OAuth redirects)
        if (event === 'SIGNED_IN' && session?.user) {
          const provider = session.user.app_metadata?.provider
          const method = provider === 'google' ? 'google' : 'email'
          trackEvent({
            name: 'auth_login_completed',
            properties: {
              method,
              user_id: session.user.id,
            },
          })
          identifyUserWithProperties(session.user.id, session.user.email)
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setSession(null)
          router.push('/')
          resetUser()
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [identifyUser, identifyUserWithProperties, resetUser, router, supabase, trackEvent])

  const signUp = async (email: string, password: string) => {
    trackEvent({
      name: 'auth_signup_started',
      properties: { method: 'email' },
    })

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (!error) {
        const userId = data?.user?.id ?? email
        trackEvent({
          name: 'auth_signup_completed',
          properties: { method: 'email', user_id: userId },
        })
        if (data?.user?.id) {
          identifyUserWithProperties(data.user.id, data.user.email)
        }
      } else {
        trackError('auth_signup', error.message, 'email_signup')
      }

      return { error }
    } catch (error) {
      console.error('Sign up error:', error)
      trackError('auth_signup', (error as Error).message, 'email_signup')
      return { error: error as AuthError }
    }
  }

  const signIn = async (email: string, password: string) => {
    trackEvent({
      name: 'auth_login_started',
      properties: { method: 'email' },
    })

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (!error && data.user) {
        trackEvent({
          name: 'auth_login_completed',
          properties: { method: 'email', user_id: data.user.id },
        })
        identifyUserWithProperties(data.user.id, data.user.email)
      } else if (error) {
        trackError('auth_login', error.message, 'email_login')
      }

      return { error }
    } catch (error) {
      console.error('Sign in error:', error)
      trackError('auth_login', (error as Error).message, 'email_login')
      return { error: error as AuthError }
    }
  }

  const signInWithGoogle = async () => {
    trackEvent({
      name: 'auth_login_started',
      properties: { method: 'google' },
    })

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        trackError('auth_login', error.message, 'google_oauth')
      }
      // Note: Success tracking will happen in the auth state change handler

      return { error }
    } catch (error) {
      console.error('Google sign in error:', error)
      trackError('auth_login', (error as Error).message, 'google_oauth')
      return { error: error as AuthError }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (!error) {
        trackEvent({ name: 'auth_logout_completed' })
        resetUser()
      } else {
        trackError('auth_logout', error.message, 'signout')
      }

      return { error }
    } catch (error) {
      console.error('Sign out error:', error)
      trackError('auth_logout', (error as Error).message, 'signout')
      return { error: error as AuthError }
    }
  }

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      })
      return { error }
    } catch (error) {
      console.error('Reset password error:', error)
      return { error: error as AuthError }
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
