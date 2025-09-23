'use client'

import { useState, useEffect } from 'react'
import { useAuthForm } from '../lib/auth-hooks'
import { SuccessMessage, ErrorMessage, LoadingSpinner } from './ui/message'

interface LoginFormProps {
  onSuccess?: () => void
}

const FORM_CLASSES = 'space-y-4'
const INPUT_GROUP_CLASSES = 'space-y-2'
const LABEL_CLASSES = 'block text-sm font-semibold text-slate-700'
const INPUT_CLASSES = 'w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100'
const PRIMARY_BUTTON_CLASSES = 'w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(56,189,248,0.2)] transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:translate-y-0 disabled:bg-slate-300 disabled:shadow-none'
const GOOGLE_BUTTON_CLASSES = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:bg-slate-50 disabled:text-slate-400'
const DIVIDER_CLASSES = 'relative flex items-center justify-center'
const DIVIDER_LINE_CLASSES = 'absolute inset-x-0 h-px bg-slate-200'
const DIVIDER_TEXT_CLASSES = 'relative bg-white px-4 text-xs font-semibold text-slate-500'
const FORGOT_PASSWORD_CLASSES = 'text-xs text-slate-500 hover:text-slate-700'

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [formState, formActions] = useAuthForm('login')
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  // Watch for success state changes and close modal
  useEffect(() => {
    if (formState.success && onSuccess) {
      onSuccess()
    }
  }, [formState.success, onSuccess])

  const handleSubmit = async (e: React.FormEvent) => {
    await formActions.handleEmailPasswordLogin(e)
  }

  const handleGoogleSignIn = async () => {
    await formActions.handleGoogleAuth()
    // Don't call onSuccess here as Google OAuth redirects
  }

  const handleForgotPassword = async () => {
    await formActions.handlePasswordReset()
    if (formState.success) {
      setShowForgotPassword(false)
    }
  }

  return (
    <div className={FORM_CLASSES}>
      {/* Google Sign In */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={formState.loading}
        className={GOOGLE_BUTTON_CLASSES}
      >
        <div className="flex items-center justify-center gap-3">
          {formState.loading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          {formState.loading ? 'Signing in...' : 'Continue with Google'}
        </div>
      </button>

      {/* Divider */}
      <div className={DIVIDER_CLASSES}>
        <div className={DIVIDER_LINE_CLASSES} />
        <span className={DIVIDER_TEXT_CLASSES}>OR</span>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={INPUT_GROUP_CLASSES}>
          <label htmlFor="email" className={LABEL_CLASSES}>
            Email
          </label>
          <input
            type="email"
            id="email"
            value={formState.email}
            onChange={(e) => formActions.setEmail(e.target.value)}
            placeholder="Enter your email"
            className={INPUT_CLASSES}
            disabled={formState.loading}
            required
          />
        </div>

        <div className={INPUT_GROUP_CLASSES}>
          <label htmlFor="password" className={LABEL_CLASSES}>
            Password
          </label>
          <input
            type="password"
            id="password"
            value={formState.password}
            onChange={(e) => formActions.setPassword(e.target.value)}
            placeholder="Enter your password"
            className={INPUT_CLASSES}
            disabled={formState.loading}
            required
          />
        </div>

        {/* Messages */}
        {formState.error && (
          <ErrorMessage>
            {formState.error}
          </ErrorMessage>
        )}

        {formState.success && (
          <SuccessMessage>
            {formState.success}
          </SuccessMessage>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={formState.loading}
          className={PRIMARY_BUTTON_CLASSES}
        >
          <div className="flex items-center justify-center gap-2">
            {formState.loading && <LoadingSpinner size="sm" />}
            {formState.loading ? 'Signing in...' : 'Sign in'}
          </div>
        </button>

        {/* Forgot Password */}
        <div className="text-center">
          {showForgotPassword ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                Enter your email above and click the button below to receive a password reset link.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={formState.loading || !formState.email}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:text-slate-400 flex items-center gap-1"
                >
                  {formState.loading && <LoadingSpinner size="sm" />}
                  Send reset link
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className={FORGOT_PASSWORD_CLASSES}
            >
              Forgot your password?
            </button>
          )}
        </div>
      </form>
    </div>
  )
}