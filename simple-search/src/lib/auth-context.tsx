'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
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
  const tracking = usePostHogTracking()

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
          tracking.trackLoginCompleted(session.user.id, method)
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setSession(null)
          router.push('/')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router, supabase.auth])

  const signUp = async (email: string, password: string) => {
    tracking.trackSignupAttempted('email')

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (!error) {
        // Note: User ID will be available after email confirmation
        tracking.trackSignupCompleted(email, 'email')
      } else {
        tracking.trackError('signup_error', error.message, 'email_signup')
      }

      return { error }
    } catch (error) {
      console.error('Sign up error:', error)
      tracking.trackError('signup_exception', (error as Error).message, 'email_signup')
      return { error: error as AuthError }
    }
  }

  const signIn = async (email: string, password: string) => {
    tracking.trackLoginAttempted('email')

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (!error && data.user) {
        tracking.trackLoginCompleted(data.user.id, 'email')
      } else if (error) {
        tracking.trackError('login_error', error.message, 'email_login')
      }

      return { error }
    } catch (error) {
      console.error('Sign in error:', error)
      tracking.trackError('login_exception', (error as Error).message, 'email_login')
      return { error: error as AuthError }
    }
  }

  const signInWithGoogle = async () => {
    tracking.trackLoginAttempted('google')

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        tracking.trackError('google_login_error', error.message, 'google_oauth')
      }
      // Note: Success tracking will happen in the auth state change handler

      return { error }
    } catch (error) {
      console.error('Google sign in error:', error)
      tracking.trackError('google_login_exception', (error as Error).message, 'google_oauth')
      return { error: error as AuthError }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (!error) {
        tracking.trackLogoutCompleted()
      } else {
        tracking.trackError('logout_error', error.message, 'signout')
      }

      return { error }
    } catch (error) {
      console.error('Sign out error:', error)
      tracking.trackError('logout_exception', (error as Error).message, 'signout')
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
