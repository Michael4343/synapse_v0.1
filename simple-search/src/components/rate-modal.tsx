'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { StarRating } from './star-rating'
import { usePostHogTracking } from '../hooks/usePostHogTracking'

interface ApiSearchResult {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citationCount: number | null
  semanticScholarId: string
  arxivId: string | null
  doi: string | null
  url: string | null
  source: string
}

interface PaperRating {
  id: number
  user_id: string
  paper_semantic_scholar_id: string
  paper_title: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

interface RateModalProps {
  isOpen: boolean
  paper: ApiSearchResult | null
  onClose: () => void
  onRated: () => void
  existingRating?: PaperRating | null
}

const MODAL_CONTAINER_CLASSES = 'fixed inset-0 z-50 flex items-center justify-center px-4 py-4 overflow-y-auto'
const MODAL_BACKDROP_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm'
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_TITLE_CLASSES = 'text-xl font-semibold text-slate-900'
const COMMENT_TEXTAREA_CLASSES = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 resize-vertical min-h-[100px]'
const BUTTON_PRIMARY_CLASSES = 'inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60'
const BUTTON_SECONDARY_CLASSES = 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900'
const RATING_CONTAINER_CLASSES = 'flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-6'

export function RateModal({ isOpen, paper, onClose, onRated, existingRating }: RateModalProps) {
  const tracking = usePostHogTracking()

  const [rating, setRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isUpdate = Boolean(existingRating)
  const modalTitle = isUpdate ? 'Update Rating' : 'Rate Paper'
  const submitButtonText = isUpdate ? 'Update Rating' : 'Submit Rating'

  // Reset modal state when it opens or when existingRating changes
  useEffect(() => {
    if (isOpen) {
      setError('')
      setSuccess('')

      if (existingRating) {
        setRating(existingRating.rating)
        setComment(existingRating.comment || '')
      } else {
        setRating(0)
        setComment('')
      }
    }
  }, [isOpen, existingRating])

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const handleSubmit = async () => {
    if (!paper) return

    if (rating === 0) {
      setError('Please select a rating')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const endpoint = '/api/ratings'
      const method = isUpdate ? 'PUT' : 'POST'
      const body = {
        paperSemanticScholarId: paper.semanticScholarId,
        paperTitle: paper.title,
        rating,
        comment: comment.trim() || undefined
      }

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `Failed to ${isUpdate ? 'update' : 'submit'} rating`
        setError(errorMessage)
        tracking.trackError('rating_api_error', errorMessage, 'rating_submission')
        setLoading(false)
        return
      }

      // Track successful rating
      tracking.trackPaperRated(paper.semanticScholarId, paper.title, rating)

      const successMessage = isUpdate ? 'Rating updated successfully!' : 'Rating submitted successfully!'
      setSuccess(successMessage)

      setTimeout(() => {
        onRated()
        onClose()
      }, 1500)

    } catch (error) {
      console.error('Rating submission failed:', error)
      setError('Something went wrong. Please try again.')
      tracking.trackError('rating_submission_exception', (error as Error).message, 'rating_modal')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!paper || !existingRating) return

    if (!confirm('Are you sure you want to delete your rating for this paper?')) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/ratings/${paper.semanticScholarId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || 'Failed to delete rating')
        setLoading(false)
        return
      }

      setSuccess('Rating deleted successfully!')

      setTimeout(() => {
        onRated()
        onClose()
      }, 1500)

    } catch (error) {
      console.error('Rating deletion failed:', error)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !paper) return null

  return (
    <div className={MODAL_CONTAINER_CLASSES}>
      <div
        className={MODAL_BACKDROP_CLASSES}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={MODAL_PANEL_CLASSES}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={MODAL_HEADER_CLASSES}>
          <h2 className={MODAL_TITLE_CLASSES}>{modalTitle}</h2>
          <p className="mt-2 text-sm text-slate-600 truncate">
            {paper.title}
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className={RATING_CONTAINER_CLASSES}>
            <label className="text-sm font-medium text-slate-700">
              Your Rating
            </label>
            <StarRating
              rating={rating}
              onRatingChange={setRating}
              size="lg"
              interactive={!loading}
            />
            {rating > 0 && (
              <p className="text-xs text-slate-500 text-center">
                {rating} star{rating === 1 ? '' : 's'} - {
                  rating === 1 ? 'Poor' :
                  rating === 2 ? 'Fair' :
                  rating === 3 ? 'Good' :
                  rating === 4 ? 'Very Good' :
                  'Excellent'
                }
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="comment" className="text-sm font-medium text-slate-700">
              Comments (Optional)
            </label>
            <textarea
              id="comment"
              placeholder="Share your thoughts about this paper..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={loading}
              className={COMMENT_TEXTAREA_CLASSES}
              maxLength={2000}
            />
            <p className="text-xs text-slate-500 text-right">
              {comment.length}/2000 characters
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={BUTTON_SECONDARY_CLASSES}
              disabled={loading}
            >
              Cancel
            </button>

            {isUpdate && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || rating === 0}
              className={`${BUTTON_PRIMARY_CLASSES} flex-1`}
            >
              {loading ? `${isUpdate ? 'Updating' : 'Submitting'}...` : submitButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}