'use client'

import { useState } from 'react'

interface StarRatingProps {
  rating: number
  onRatingChange?: (rating: number) => void
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  className?: string
}

const STAR_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6'
}

export function StarRating({
  rating,
  onRatingChange,
  size = 'md',
  interactive = true,
  className = ''
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0)

  const handleStarClick = (starIndex: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(starIndex)
    }
  }

  const handleStarHover = (starIndex: number) => {
    if (interactive) {
      setHoverRating(starIndex)
    }
  }

  const handleMouseLeave = () => {
    if (interactive) {
      setHoverRating(0)
    }
  }

  const displayRating = hoverRating || rating

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      onMouseLeave={handleMouseLeave}
    >
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const isFilled = starIndex <= displayRating
        const isHovering = hoverRating > 0 && starIndex <= hoverRating

        return (
          <button
            key={starIndex}
            type="button"
            className={`${interactive ? 'cursor-pointer' : 'cursor-default'} transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-opacity-50 rounded-sm`}
            onClick={() => handleStarClick(starIndex)}
            onMouseEnter={() => handleStarHover(starIndex)}
            disabled={!interactive}
            aria-label={`Rate ${starIndex} star${starIndex === 1 ? '' : 's'}`}
          >
            <svg
              className={`${STAR_SIZES[size]} ${
                isFilled
                  ? isHovering
                    ? 'text-yellow-400'
                    : 'text-yellow-500'
                  : interactive
                    ? 'text-slate-300 hover:text-yellow-400'
                    : 'text-slate-300'
              } transition-colors duration-150`}
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118L10 13.347l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.364-1.118L2.643 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69L9.049 2.927z" />
            </svg>
          </button>
        )
      })}
      {interactive && hoverRating > 0 && (
        <span className="ml-2 text-sm text-slate-600">
          {hoverRating} star{hoverRating === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}