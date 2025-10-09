'use client'

import { useEffect } from 'react'
import { X, Microscope } from 'lucide-react'

interface SimilarPaper {
  id: string
  title: string
  authors: string[]
  year: number
  venue: string
  citationCount: number
  methodology: string
  methodologicalNotes: string[]
  abstractPreview: string
}

interface SimilarPapersModalProps {
  isOpen: boolean
  currentPaperTitle: string
  papers: SimilarPaper[]
  onClose: () => void
}

export function SimilarPapersModal({ isOpen, currentPaperTitle, papers, onClose }: SimilarPapersModalProps) {
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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="similar-papers-modal-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-4 rounded-t-3xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Similar Papers</p>
          <h2 id="similar-papers-modal-title" className="mt-2 text-2xl font-semibold text-slate-900 pr-8">
            Papers with Similar Methodologies
          </h2>
          <p className="mt-2 text-sm text-slate-600 truncate pr-8">
            Based on: {currentPaperTitle}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {papers.map((paper) => (
            <article
              key={paper.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-slate-300"
            >
              {/* Methodology - Most Prominent */}
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-emerald-100 p-2">
                  <Microscope className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Methodology</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">{paper.methodology}</h3>
                </div>
              </div>

              {/* Methodological Notes */}
              <div className="mb-4 rounded-lg bg-slate-50 p-4">
                <ul className="space-y-2">
                  {paper.methodologicalNotes.map((note, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1 text-emerald-600">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Paper Details */}
              <div className="mb-3">
                <h4 className="text-lg font-semibold text-slate-900 leading-snug">{paper.title}</h4>
                <p className="mt-2 text-sm text-slate-600">
                  {paper.authors.length <= 3
                    ? paper.authors.join(', ')
                    : `${paper.authors.slice(0, 3).join(', ')} et al.`}
                </p>
              </div>

              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>{paper.year}</span>
                <span>{paper.venue}</span>
                <span>{paper.citationCount.toLocaleString()} citations</span>
              </div>

              {/* Abstract Preview */}
              {paper.abstractPreview && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                    {paper.abstractPreview}
                  </p>
                </div>
              )}
            </article>
          ))}

          {papers.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-slate-500">No similar papers found.</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-4 rounded-b-3xl">
          <div className="flex justify-end">
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
    </div>
  )
}
