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
  success: string
  isPasswordResetMode?: boolean
}

interface UseAuthFormActions {
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  setConfirmPassword?: (password: string) => void
  setOrcidId?: (orcidId: string) => void
  setAcademicWebsite?: (website: string) => void
  setError: (error: string) => void
  setSuccess: (success: string) => void
  clearError: () => void
  clearSuccess: () => void
  clearMessages: () => void
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
  const [success, setSuccess] = useState('')

  const clearError = () => setError('')
  const clearSuccess = () => setSuccess('')
  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  // Helper function to create user-friendly error messages
  const getErrorMessage = (error: any): string => {
    const message = error?.message || error || 'An unexpected error occurred'

    // Convert common Supabase errors to user-friendly messages
    if (message.includes('Invalid login credentials')) {
      return 'Invalid email or password. Please check your credentials and try again.'
    }
    if (message.includes('Email not confirmed')) {
      return 'Please check your email and click the confirmation link before signing in.'
    }
    if (message.includes('User already registered')) {
      return 'An account with this email already exists. Try signing in instead.'
    }
    if (message.includes('Password should be at least')) {
      return 'Password must be at least 6 characters long.'
    }
    if (message.includes('Unable to validate email address')) {
      return 'Please enter a valid email address.'
    }
    if (message.includes('signups not allowed')) {
      return 'New registrations are temporarily disabled. Please try again later.'
    }
    if (message.includes('Email rate limit exceeded')) {
      return 'Too many emails sent. Please wait a few minutes before trying again.'
    }

    return message
  }

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    clearMessages()

    const { error: authError } = await signIn(email, password)

    if (authError) {
      setError(getErrorMessage(authError))
      setLoading(false)
    } else {
      setSuccess('Successfully signed in! Welcome back.')
      setLoading(false)
    }
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
    clearMessages()

    const profileData = {
      orcidId: orcidId.trim() || null,
      academicWebsite: academicWebsite.trim() || null
    }

    const { error: authError } = await signUp(email, password, profileData)

    if (authError) {
      setError(getErrorMessage(authError))
    } else {
      setSuccess('Account created successfully! You can now start exploring academic research.')
    }

    setLoading(false)
  }

  const handleGoogleAuth = async () => {
    setLoading(true)
    clearMessages()

    const { error: authError } = await signInWithGoogle()

    if (authError) {
      setError(getErrorMessage(authError))
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
    clearMessages()

    const { error: authError } = await resetPassword(email)

    if (authError) {
      setError(getErrorMessage(authError))
    } else {
      setSuccess(`Password reset link sent to ${email}. Please check your inbox and spam folder.`)
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
    error,
    success
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
    setSuccess,
    clearError,
    clearSuccess,
    clearMessages,
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