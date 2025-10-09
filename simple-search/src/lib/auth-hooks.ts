'use client'

import { useState } from 'react'
import { useAuth } from './auth-context'

interface UseAuthFormState {
  email: string
  password: string
  confirmPassword?: string
  loading: boolean
  error: string
  success: string
  errorType: 'none' | 'invalid-password' | 'no-account' | 'generic'
  successType: 'none' | 'login' | 'signup' | 'password-reset' | 'generic'
}

interface UseAuthFormActions {
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  setConfirmPassword?: (password: string) => void
  setError: (error: string, type?: 'invalid-password' | 'no-account' | 'generic') => void
  setSuccess: (success: string, type?: 'login' | 'signup' | 'password-reset' | 'generic') => void
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
  const [loading, setLoading] = useState(false)
  const [error, setErrorMessage] = useState('')
  const [success, setSuccessMessage] = useState('')
  const [errorType, setErrorType] = useState<'none' | 'invalid-password' | 'no-account' | 'generic'>('none')
  const [successType, setSuccessType] = useState<'none' | 'login' | 'signup' | 'password-reset' | 'generic'>('none')

  const setError = (message: string, type: 'invalid-password' | 'no-account' | 'generic' = 'generic') => {
    setErrorMessage(message)
    setErrorType(type)
    setSuccessType('none')
  }

  const clearError = () => {
    setErrorMessage('')
    setErrorType('none')
  }

  const setSuccess = (message: string, type: 'login' | 'signup' | 'password-reset' | 'generic' = 'generic') => {
    setSuccessMessage(message)
    setErrorType('none')
    setSuccessType(type)
  }

  const clearSuccess = () => {
    setSuccessMessage('')
    setSuccessType('none')
  }
  const clearMessages = () => {
    setErrorMessage('')
    setSuccessMessage('')
    setErrorType('none')
    setSuccessType('none')
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
      return 'An account with this email already exists. Sign in or reset your password instead.'
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

  const checkAccountExists = async (emailToCheck: string): Promise<boolean | null> => {
    try {
      const response = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: emailToCheck })
      })

      if (!response.ok) {
        return null
      }

      const data: { exists?: boolean } = await response.json()

      return typeof data.exists === 'boolean' ? data.exists : null
    } catch (error) {
      console.warn('Unable to verify account existence:', error)
      return null
    }
  }

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()

    if (trimmedEmail !== email) {
      setEmail(trimmedEmail)
    }

    if (!trimmedEmail || !password) {
    setError('Please fill in all fields')
    return
  }

  setLoading(true)
  clearMessages()

  const { error: authError } = await signIn(trimmedEmail, password)

  if (authError) {
    if (authError.message?.includes('Invalid login credentials')) {
      const accountExists = await checkAccountExists(trimmedEmail)

        if (accountExists === false) {
          setError('No account found for this email.', 'no-account')
        } else if (accountExists === true) {
          setError('Incorrect password.', 'invalid-password')
        } else {
          setError('We could not confirm your account right now. Try again or reset your password.', 'generic')
        }
      } else {
        setError(getErrorMessage(authError))
      }
      setLoading(false)
      return
    }

    setSuccess('Successfully signed in!', 'login')
    setLoading(false)
  }

  const handleEmailPasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()

    if (trimmedEmail !== email) {
      setEmail(trimmedEmail)
    }

    if (!trimmedEmail || !password) {
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

    const { error: authError } = await signUp(trimmedEmail, password)

    if (authError) {
      setError(getErrorMessage(authError))
    } else {
      setSuccess('Account created! You are signed in and your personal feed is ready to set up.', 'signup')
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
    const trimmedEmail = email.trim()

    if (trimmedEmail !== email) {
      setEmail(trimmedEmail)
    }

    if (!trimmedEmail) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    clearMessages()

    const { error: authError } = await resetPassword(trimmedEmail)

    if (authError) {
      setError(getErrorMessage(authError))
    } else {
      setSuccess(`Password reset link sent to ${trimmedEmail}. Please check your inbox and spam folder.`, 'password-reset')
    }

    setLoading(false)
  }

  const state: UseAuthFormState = {
    email,
    password,
    ...(mode === 'signup' && {
      confirmPassword
    }),
    loading,
    error,
    success,
    errorType,
    successType
  }

  const actions: UseAuthFormActions = {
    setEmail,
    setPassword,
    ...(mode === 'signup' && {
      setConfirmPassword
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
