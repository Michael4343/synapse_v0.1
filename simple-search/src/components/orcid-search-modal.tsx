'use client'

import { useState, useEffect } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import { searchOrcidByName, type OrcidSearchResult, formatOrcidId } from '../lib/orcid-utils'

interface OrcidSearchModalProps {
  isOpen: boolean
  firstName: string
  lastName: string
  onSelect: (orcidId: string) => void
  onSkip: () => void
}

const MODAL_CONTAINER_CLASSES = 'fixed inset-0 z-50 flex items-center justify-center px-4 py-4 overflow-y-auto'
const MODAL_BACKDROP_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm'
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4 max-h-[90vh] overflow-hidden flex flex-col'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_TITLE_CLASSES = 'text-2xl font-semibold text-slate-900'
const MODAL_SUBTITLE_CLASSES = 'mt-2 text-sm text-slate-600'
const BUTTON_PRIMARY_CLASSES = 'px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed'
const BUTTON_SECONDARY_CLASSES = 'w-full px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 transition'

export function OrcidSearchModal({ isOpen, firstName, lastName, onSelect, onSkip }: OrcidSearchModalProps) {
  const [results, setResults] = useState<OrcidSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)

  // Auto-search on mount
  useEffect(() => {
    if (!isOpen || !firstName || !lastName) {
      return
    }

    const performSearch = async () => {
      setLoading(true)
      setError('')
      setResults([])

      try {
        const response = await searchOrcidByName(firstName, lastName)
        setResults(response.results || [])
      } catch (err) {
        console.error('ORCID search failed:', err)
        setError(err instanceof Error ? err.message : 'Failed to search ORCID registry')
      } finally {
        setLoading(false)
      }
    }

    performSearch()
  }, [isOpen, firstName, lastName])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleSelect = async (orcidId: string) => {
    setSelecting(true)
    try {
      await onSelect(orcidId)
    } finally {
      setSelecting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className={MODAL_CONTAINER_CLASSES}>
      {/* Backdrop - clickable to skip */}
      <div
        className={MODAL_BACKDROP_CLASSES}
        onClick={onSkip}
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
            Let&apos;s find your ORCID iD
          </h2>
          <p className={MODAL_SUBTITLE_CLASSES}>
            We found {results.length > 0 ? `${results.length} profile${results.length === 1 ? '' : 's'}` : 'profiles'} matching &quot;{firstName} {lastName}&quot;
          </p>
        </div>

        {/* Content */}
        <div className="mt-6 flex-1 overflow-y-auto min-h-0">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-slate-400 animate-pulse mb-4" />
              <p className="text-sm text-slate-600">Searching ORCID registry...</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-800">{error}</p>
              <p className="mt-2 text-xs text-red-600">You can skip this step and add your ORCID iD manually later.</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && results.length === 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-8 text-center">
              <Search className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-sm font-medium text-slate-700 mb-2">No ORCID profiles found</p>
              <p className="text-xs text-slate-500">
                No results found for &quot;{firstName} {lastName}&quot;. You can skip this step and add your ORCID iD manually later in your profile settings.
              </p>
            </div>
          )}

          {/* Results list */}
          {!loading && !error && results.length > 0 && (
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.orcidId}
                  className="rounded-lg border border-slate-200 p-4 hover:border-sky-300 hover:bg-sky-50/50 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 mb-1">
                        {result.name || 'Unknown Name'}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                        <code className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono">
                          {formatOrcidId(result.orcidId)}
                        </code>
                        <a
                          href={`https://orcid.org/${result.orcidId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:text-sky-700 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {result.institution && (
                        <p className="text-xs text-slate-500 truncate">
                          {result.institution}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleSelect(result.orcidId)}
                      disabled={selecting}
                      className={BUTTON_PRIMARY_CLASSES}
                    >
                      {selecting ? 'Selecting...' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onSkip}
            disabled={selecting}
            className={BUTTON_SECONDARY_CLASSES}
          >
            Skip for now
          </button>
          <p className="mt-2 text-xs text-center text-slate-500">
            You can add your ORCID iD later in profile settings
          </p>
        </div>
      </div>
    </div>
  )
}
