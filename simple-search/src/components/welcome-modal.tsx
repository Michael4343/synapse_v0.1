'use client'

import { useState, useEffect } from 'react'

interface WelcomeModalProps {
  isOpen: boolean
  onSave: (firstName: string, lastName: string) => Promise<any>
}

const MODAL_CONTAINER_CLASSES = 'fixed inset-0 z-50 flex items-center justify-center px-4 py-4 overflow-y-auto'
const MODAL_BACKDROP_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm'
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_TITLE_CLASSES = 'text-2xl font-semibold text-slate-900'
const MODAL_SUBTITLE_CLASSES = 'mt-2 text-sm text-slate-600'
const INPUT_LABEL_CLASSES = 'block text-sm font-medium text-slate-700 mb-1.5'
const INPUT_FIELD_CLASSES = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition'
const ERROR_MESSAGE_CLASSES = 'mt-2 text-sm text-red-600'
const BUTTON_PRIMARY_CLASSES = 'w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

export function WelcomeModal({ isOpen, onSave }: WelcomeModalProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedFirstName = firstName.trim()
    const trimmedLastName = lastName.trim()

    if (!trimmedFirstName || !trimmedLastName) {
      setError('Both first and last name are required')
      return
    }

    setSaving(true)
    try {
      const saveError = await onSave(trimmedFirstName, trimmedLastName)
      if (saveError) {
        setError('Failed to save names. Please try again.')
        setSaving(false)
      }
      // If successful, parent will close modal by changing isOpen
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={MODAL_CONTAINER_CLASSES}>
      {/* Non-clickable backdrop */}
      <div
        className={MODAL_BACKDROP_CLASSES}
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
            Welcome to Evidentia
          </h2>
          <p className={MODAL_SUBTITLE_CLASSES}>
            Let&apos;s personalize your experience
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="welcome-first-name" className={INPUT_LABEL_CLASSES}>
              First name
            </label>
            <input
              id="welcome-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={INPUT_FIELD_CLASSES}
              placeholder="Jane"
              autoComplete="given-name"
              autoFocus
              disabled={saving}
            />
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="welcome-last-name" className={INPUT_LABEL_CLASSES}>
              Last name
            </label>
            <input
              id="welcome-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={INPUT_FIELD_CLASSES}
              placeholder="Smith"
              autoComplete="family-name"
              disabled={saving}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className={ERROR_MESSAGE_CLASSES}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving}
            className={BUTTON_PRIMARY_CLASSES}
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
