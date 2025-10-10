'use client'

import { useEffect } from 'react'

interface TourPromptModalProps {
  isOpen: boolean
  onYes: () => void
  onNo: () => void
}

const MODAL_CONTAINER_CLASSES = 'fixed inset-0 z-50 flex items-center justify-center px-4 py-4 overflow-y-auto'
const MODAL_BACKDROP_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm'
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_TITLE_CLASSES = 'text-2xl font-semibold text-slate-900'
const MODAL_SUBTITLE_CLASSES = 'mt-2 text-sm text-slate-600'
const BUTTON_CONTAINER_CLASSES = 'mt-6 flex gap-3'
const YES_BUTTON_CLASSES = 'flex-1 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400'
const NO_BUTTON_CLASSES = 'flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50'

export function TourPromptModal({ isOpen, onYes, onNo }: TourPromptModalProps) {
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onNo()
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
  }, [isOpen, onNo])

  if (!isOpen) return null

  return (
    <div className={MODAL_CONTAINER_CLASSES}>
      {/* Backdrop */}
      <div
        className={MODAL_BACKDROP_CLASSES}
        onClick={onNo}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className={MODAL_PANEL_CLASSES}>
        {/* Header */}
        <div className={MODAL_HEADER_CLASSES}>
          <div className="mb-4">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-600">Evidentia</span>
          </div>
          <h2 className={MODAL_TITLE_CLASSES}>
            Would you like a tour?
          </h2>
          <p className={MODAL_SUBTITLE_CLASSES}>
            Take a quick guided tour to explore Evidentia's features
          </p>
        </div>

        {/* Buttons */}
        <div className={BUTTON_CONTAINER_CLASSES}>
          <button
            onClick={onNo}
            className={NO_BUTTON_CLASSES}
          >
            No, thanks
          </button>
          <button
            onClick={onYes}
            className={YES_BUTTON_CLASSES}
          >
            Yes, show me
          </button>
        </div>
      </div>
    </div>
  )
}
