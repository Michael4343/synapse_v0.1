'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { ErrorMessage, SuccessMessage, LoadingSpinner } from '../../../components/ui/message'

const CARD_CLASSES = 'w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.12)]'
const INPUT_CLASSES = 'w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100'
const BUTTON_CLASSES = 'w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:translate-y-0 disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:bg-slate-300'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const initialiseSession = async () => {
      if (typeof window === 'undefined') {
        return
      }

      setStatus('loading')
      setError('')

      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const searchParams = new URLSearchParams(window.location.search)

        let activeSession = null

        const { data: existingSession, error: existingSessionError } = await supabase.auth.getSession()
        if (existingSessionError) {
          throw existingSessionError
        }

        activeSession = existingSession.session

        if (!activeSession) {
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')

          if (accessToken && refreshToken) {
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            })

            if (sessionError) {
              throw sessionError
            }

            activeSession = sessionData.session
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
          }
        }

        if (!activeSession) {
          const code = searchParams.get('code') || hashParams.get('code')

          if (code) {
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) {
              throw exchangeError
            }

            activeSession = exchangeData.session

            searchParams.delete('code')
            searchParams.delete('type')
            const cleanQuery = searchParams.toString()
            window.history.replaceState({}, document.title, cleanQuery ? `${window.location.pathname}?${cleanQuery}` : window.location.pathname)
          }
        }

        if (!activeSession) {
          throw new Error('No active session found after processing reset link')
        }

        setStatus('ready')
      } catch (err) {
        console.error('Reset password session error:', err)
        setError('We could not validate your reset link. Please request a new email and try again.')
        setStatus('error')
      }
    }

    initialiseSession()
  }, [supabase])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (submitting) {
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      console.error('Reset password update error:', updateError)
      setError(updateError.message || 'Unable to update password. Please try again.')
      setSubmitting(false)
      return
    }

    setSuccess('Your password has been updated. You can now sign in with the new password.')
    setStatus('success')
    setSubmitting(false)

    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className={CARD_CLASSES}>
        <h1 className="text-2xl font-semibold text-slate-900">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Choose a new password to regain access to your account.
        </p>

        <div className="mt-6 space-y-4">
          {status === 'loading' && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <LoadingSpinner size="sm" />
              Validating reset link...
            </div>
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}
          {success && <SuccessMessage>{success}</SuccessMessage>}

          {status === 'ready' && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`mt-2 ${INPUT_CLASSES}`}
                  placeholder="Enter a new password"
                  minLength={6}
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={`mt-2 ${INPUT_CLASSES}`}
                  placeholder="Re-enter your new password"
                  minLength={6}
                  required
                  disabled={submitting}
                />
              </div>

              <button type="submit" className={BUTTON_CLASSES} disabled={submitting}>
                <div className="flex items-center justify-center gap-2">
                  {submitting && <LoadingSpinner size="sm" />}
                  {submitting ? 'Updating password...' : 'Update password'}
                </div>
              </button>
            </form>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <SuccessMessage>
                Your password has been updated. Sign in with your new password to continue.
              </SuccessMessage>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              >
                Return to sign in
              </button>
            </div>
          )}

          {status === 'error' && !success && (
            <div className="space-y-4">
              <ErrorMessage>
                The reset link is invalid or has expired. Request a new email from the sign-in screen.
              </ErrorMessage>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              >
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
