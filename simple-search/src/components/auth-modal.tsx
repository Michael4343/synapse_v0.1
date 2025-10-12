'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
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
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4 max-h-[90vh] overflow-y-auto'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_SUBTITLE_CLASSES = 'mt-2 text-sm text-slate-600'
const TABS_CONTAINER_CLASSES = 'flex gap-2 mb-4 bg-slate-100 rounded-lg p-1'
const TAB_CLASSES = 'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all duration-200'
const TAB_ACTIVE_CLASSES = 'bg-white text-slate-900 shadow-sm'
const TAB_INACTIVE_CLASSES = 'text-slate-600 hover:text-slate-900'

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
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className={MODAL_HEADER_CLASSES}>
          <div className="mb-4">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">Evidentia</span>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Evidentia works best on a computer. Please continue on desktop for the full experience.
          </p>
          {/* Tabs */}
          <div className={TABS_CONTAINER_CLASSES}>
            <button
              type="button"
              onClick={() => mode === 'signup' && onSwitchMode()}
              className={`${TAB_CLASSES} ${mode === 'login' ? TAB_ACTIVE_CLASSES : TAB_INACTIVE_CLASSES}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => mode === 'login' && onSwitchMode()}
              className={`${TAB_CLASSES} ${mode === 'signup' ? TAB_ACTIVE_CLASSES : TAB_INACTIVE_CLASSES}`}
            >
              Sign up
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="mt-6">
          {mode === 'login' ? (
            <LoginForm onSuccess={onClose} onSwitchToSignup={onSwitchMode} />
          ) : (
            <RegisterForm onSuccess={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}
