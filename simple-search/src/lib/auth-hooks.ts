'use client'

import { useState } from 'react'
import { useAuth } from './auth-context'

interface UseAuthFormState {
  email: string
  password: string
  confirmPassword?: string
  orcidId?: string
  academicWebsite?: string
  loading: boolean
  error: string
}

interface UseAuthFormActions {
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  setConfirmPassword?: (password: string) => void
  setOrcidId?: (orcidId: string) => void
  setAcademicWebsite?: (website: string) => void
  setError: (error: string) => void
  clearError: () => void
  handleEmailPasswordLogin: (e: React.FormEvent) => Promise<void>
  handleEmailPasswordSignup: (e: React.FormEvent) => Promise<void>
  handleGoogleAuth: () => Promise<void>
  handlePasswordReset: () => Promise<void>
}

export function useAuthForm(mode: 'login' | 'signup' = 'login'): [UseAuthFormState, UseAuthFormActions] {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [orcidId, setOrcidId] = useState('')
  const [academicWebsite, setAcademicWebsite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const clearError = () => setError('')

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    setError('')

    const { error: authError } = await signIn(email, password)

    if (authError) {
      setError(authError.message || 'Failed to sign in')
    }

    setLoading(false)
  }

  const handleEmailPasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (mode === 'signup' && confirmPassword && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError('')

    const profileData = {
      orcidId: orcidId.trim() || null,
      academicWebsite: academicWebsite.trim() || null
    }

    const { error: authError } = await signUp(email, password, profileData)

    if (authError) {
      setError(authError.message || 'Failed to create account')
    } else {
      setError('')
    }

    setLoading(false)
  }

  const handleGoogleAuth = async () => {
    setLoading(true)
    setError('')

    const { error: authError } = await signInWithGoogle()

    if (authError) {
      setError(authError.message || 'Failed to sign in with Google')
      setLoading(false)
    }
    // Note: Don't set loading to false for Google OAuth as it redirects
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError('')

    const { error: authError } = await resetPassword(email)

    if (authError) {
      setError(authError.message || 'Failed to send reset email')
    } else {
      setError('')
      // You can add success handling here
    }

    setLoading(false)
  }

  const state: UseAuthFormState = {
    email,
    password,
    ...(mode === 'signup' && {
      confirmPassword,
      orcidId,
      academicWebsite
    }),
    loading,
    error
  }

  const actions: UseAuthFormActions = {
    setEmail,
    setPassword,
    ...(mode === 'signup' && {
      setConfirmPassword,
      setOrcidId,
      setAcademicWebsite
    }),
    setError,
    clearError,
    handleEmailPasswordLogin,
    handleEmailPasswordSignup,
    handleGoogleAuth,
    handlePasswordReset
  }

  return [state, actions]
}

export function useAuthModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const openLogin = () => {
    setMode('login')
    setIsOpen(true)
  }

  const openSignup = () => {
    setMode('signup')
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
  }

  return {
    isOpen,
    mode,
    openLogin,
    openSignup,
    close,
    switchMode
  }
}

// Utility function to get user's display name
export function getUserDisplayName(user: any): string {
  if (user?.user_metadata?.full_name) {
    return user.user_metadata.full_name
  }
  if (user?.user_metadata?.name) {
    return user.user_metadata.name
  }
  if (user?.email) {
    return user.email.split('@')[0]
  }
  return 'User'
}

// Utility function to check if user's email is verified
export function isEmailVerified(user: any): boolean {
  return user?.email_confirmed_at !== null && user?.email_confirmed_at !== undefined
}