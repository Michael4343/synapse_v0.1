'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, Calendar, TrendingUp, BookOpen, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import type { WeeklyDigest, DigestPaper } from '@/lib/weekly-digest'

interface WeeklyDigestComponentProps {
  userId: string | null
}

export function WeeklyDigestComponent({ userId }: WeeklyDigestComponentProps) {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWorthReading, setShowWorthReading] = useState(false)
  const [errorBannerVisible, setErrorBannerVisible] = useState(false)

  const fetchDigest = useCallback(async () => {
    if (!userId) {
      setDigest(null)
      setError(null)
      setErrorBannerVisible(false)
      setLoading(false)
      return
    }

    console.log(`🔄 WeeklyDigest: Starting fetch for user ${userId}`)
    setLoading(true)
    setError(null)
    setErrorBannerVisible(false)

    try {
      const response = await fetch('/api/digest')
      console.log(`📡 WeeklyDigest: API response status: ${response.status}`)

      const data = await response.json()
      console.log('📊 WeeklyDigest: API response data:', {
        success: data.success,
        hasDigest: !!data.digest,
        error: data.error,
        details: data.details,
        traceId: data.traceId ?? data.digest?.traceId
      })
      const responseTraceId: string | undefined = data?.traceId ?? data?.digest?.traceId

      if (!response.ok) {
        const errorMessage = data.details
          ? `${data.error}: ${data.details}`
          : data.error || 'Failed to fetch digest'
        const messageWithTrace = responseTraceId ? `${errorMessage} (trace ${responseTraceId})` : errorMessage

        console.error('❌ WeeklyDigest: API error:', {
          status: response.status,
          error: data.error,
          details: data.details,
          traceId: responseTraceId
        })

        throw new Error(messageWithTrace)
      }

      if (!data.digest) {
        throw new Error('No digest data received from API')
      }

      console.log(`✅ WeeklyDigest: Successfully loaded digest with ${data.digest.papersCount} papers`)
      setDigest(data.digest)
      setErrorBannerVisible(false)
    } catch (err) {
      console.error('❌ WeeklyDigest: Fetch failed:', {
        error: err instanceof Error ? err.message : String(err),
        userId,
        timestamp: new Date().toISOString()
      })
      setError(err instanceof Error ? err.message : 'Failed to load digest')
      setErrorBannerVisible(true)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchDigest()
  }, [fetchDigest])

  const handleOpenProfileSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('evidentia:open-profile-editor'))
  }, [])

  if (!userId) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-3xl p-6 mb-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          <h2 className="text-lg font-semibold text-slate-800">Generating Your Weekly Research Digest</h2>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-blue-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-blue-200 rounded w-1/2 mb-4"></div>
          <div className="h-20 bg-blue-200 rounded mb-4"></div>
        </div>
      </div>
    )
  }

  if (error && !digest) {
    const isAuthError = error.includes('Authentication')
    const isApiKeyError = error.includes('GEMINI_API_KEY')
    const isNoDataError = error.includes('No new papers')

    return (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 mb-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-center gap-3 mb-3">
          <Calendar className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-800">Weekly Research Digest</h2>
        </div>

        <div className="space-y-3">
          <p className="text-amber-700 font-medium">
            {isAuthError ? 'Authentication Issue' :
             isApiKeyError ? 'Configuration Issue' :
             isNoDataError ? 'No Recent Papers' :
             'Digest Generation Failed'}
          </p>

          <p className="text-sm text-amber-600">
            {error}
          </p>

          {isApiKeyError && (
            <p className="text-xs text-amber-600 bg-amber-100 p-2 rounded">
              <strong>Developer Note:</strong> The GEMINI_API_KEY environment variable is not configured. Please check your server configuration.
            </p>
          )}

          {!isAuthError && (
            <button
              onClick={fetchDigest}
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-800 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!digest) {
    return null
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const PaperCard = ({ paper, showFullExplanation = true }: { paper: DigestPaper; showFullExplanation?: boolean }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="font-medium text-slate-800 leading-tight">{paper.title}</h4>
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <p className="text-sm text-slate-600 mb-2">
        {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}
        {paper.venue && ` • ${paper.venue}`}
        {paper.citationCount !== null && ` • ${paper.citationCount} citations`}
      </p>

      <p className={`text-sm text-slate-700 ${showFullExplanation ? '' : 'line-clamp-2'}`}>
        {paper.explanation}
      </p>
    </div>
  )

  const showEmptyState = digest.mustReadPapers.length === 0 && digest.worthReadingPapers.length === 0

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-3xl p-6 mb-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
      {/* Error banner */}
      {errorBannerVisible && error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Digest encountered an issue.</p>
              <p className="text-xs opacity-80">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setErrorBannerVisible(false)}
            className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Weekly Research Digest</h2>
        </div>
        <div className="text-sm text-slate-600">
          Week of {formatDate(digest.weekStartDate)} • {digest.papersCount} papers analyzed
        </div>
      </div>

      {/* Profile context */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600/80">
          Focus:&nbsp;
          <span className="normal-case text-slate-700">{digest.profileDescription}</span>
        </p>
        <span className="text-xs text-slate-400">Trace ID {digest.traceId}</span>
      </div>

      {digest.profileIsFallback && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Complete your research focus</p>
              <p className="text-xs text-amber-700/90">
                Refine your keywords or ORCID to unlock sharper digests tailored to you.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenProfileSettings}
            className="text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
          >
            Update profile
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-indigo-600" />
          <h3 className="font-medium text-slate-800">This Week's Developments</h3>
        </div>
        <div className="bg-white/70 rounded-xl p-4 border border-indigo-100">
          <p className="text-slate-700 leading-relaxed">{digest.summary}</p>
        </div>
      </div>

      {/* Must Read Papers */}
      {digest.mustReadPapers.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-emerald-600" />
            <h3 className="font-medium text-slate-800">Must Read ({digest.mustReadPapers.length})</h3>
          </div>
          <div className="space-y-3">
            {digest.mustReadPapers.map((paper, index) => (
              <PaperCard key={index} paper={paper} showFullExplanation={true} />
            ))}
          </div>
        </div>
      )}

      {/* Worth Reading Papers (Collapsible) */}
      {digest.worthReadingPapers.length > 0 && (
        <div>
          <button
            onClick={() => setShowWorthReading(!showWorthReading)}
            className="flex items-center gap-2 mb-3 w-full text-left group"
          >
            <BookOpen className="h-4 w-4 text-slate-500" />
            <h3 className="font-medium text-slate-800 group-hover:text-slate-900 transition-colors">
              Worth Your Time ({digest.worthReadingPapers.length})
            </h3>
            {showWorthReading ? (
              <ChevronUp className="h-4 w-4 text-slate-500 ml-auto" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500 ml-auto" />
            )}
          </button>

          {showWorthReading && (
            <div className="space-y-3">
              {digest.worthReadingPapers.map((paper, index) => (
                <PaperCard key={index} paper={paper} showFullExplanation={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {showEmptyState && (
        <div className="bg-white/70 rounded-xl p-6 border border-indigo-100 text-center">
          <p className="text-slate-600 mb-2">No strong matches this week—adjust queries or widen scope.</p>
          <p className="text-sm text-slate-500">Refreshing your keywords or ORCID focus can surface a broader set of papers.</p>
        </div>
      )}
    </div>
  )
}
