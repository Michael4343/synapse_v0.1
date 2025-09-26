'use client'

import { useEffect } from 'react'
import { LoginForm } from './login-form'
import { RegisterForm } from './register-form'

interface AuthModalProps {
  isOpen: boolean
  mode: 'login' | 'signup'
  onClose: () => void
  onSwitchMode: () => void
}

const MODAL_CONTAINER_CLASSES = 'fixed inset-0 z-50 flex items-center justify-center px-4 py-4 overflow-y-auto'
const MODAL_BACKDROP_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm'
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_TITLE_CLASSES = 'text-2xl font-semibold text-slate-900'
const MODAL_SUBTITLE_CLASSES = 'mt-2 text-sm text-slate-600'
const CLOSE_BUTTON_CLASSES = 'absolute right-6 top-6 rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700'
const SWITCH_CONTAINER_CLASSES = 'mt-6 text-center text-sm text-slate-600'
const SWITCH_BUTTON_CLASSES = 'font-semibold text-sky-600 transition hover:text-sky-700'

export function AuthModal({ isOpen, mode, onClose, onSwitchMode }: AuthModalProps) {
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className={MODAL_CONTAINER_CLASSES}>
      {/* Backdrop */}
      <div
        className={MODAL_BACKDROP_CLASSES}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className={MODAL_PANEL_CLASSES}>
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className={CLOSE_BUTTON_CLASSES}
          aria-label="Close modal"
        >
          ×
        </button>

        {/* Header */}
        <div className={MODAL_HEADER_CLASSES}>
          <h2 className={MODAL_TITLE_CLASSES}>
            {mode === 'login' ? 'Sign In' : 'Create account'}
          </h2>
          <p className={MODAL_SUBTITLE_CLASSES}>
            {mode === 'login'
              ? 'Sign in to access your saved research and preferences'
              : 'Create your account to get started'
            }
          </p>
        </div>

        {/* Form */}
        <div className="mt-6">
          {mode === 'login' ? (
            <LoginForm onSuccess={onClose} />
          ) : (
            <RegisterForm onSuccess={onClose} />
          )}
        </div>

        {/* Switch mode */}
        <div className={SWITCH_CONTAINER_CLASSES}>
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={onSwitchMode}
                className={SWITCH_BUTTON_CLASSES}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={onSwitchMode}
                className={SWITCH_BUTTON_CLASSES}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
