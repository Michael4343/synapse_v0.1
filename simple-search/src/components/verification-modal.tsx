'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface VerificationModalProps {
  isOpen: boolean
  type: 'claims' | 'reproducibility' | null
  status: 'idle' | 'sending' | 'success' | 'error'
  errorMessage: string
  onClose: () => void
}

const TYPE_COPY: Record<'claims' | 'reproducibility', { actionLabel: string }> = {
  claims: {
    actionLabel: 'VERIFY CLAIMS'
  },
  reproducibility: {
    actionLabel: 'VERIFY REPRODUCIBILITY'
  }
}

export function VerificationModal({ isOpen, type, status, errorMessage, onClose }: VerificationModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen || !type) {
    return null
  }

  const copy = TYPE_COPY[type]
  const isSending = status === 'sending'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-modal-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close verification modal"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.actionLabel}</p>
        <h2 id="verification-modal-title" className="mt-2 text-2xl font-semibold text-slate-900">
          Request received
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Our agent will search the literature and compile this information for your next feed update at 9am.
        </p>
        {isSending && (
          <p className="mt-4 text-sm font-medium text-slate-500">Sending your request…</p>
        )}
        {status === 'error' && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {errorMessage || 'We could not notify the team. Please try again in a moment.'}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
