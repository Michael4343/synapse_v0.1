'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePostHogTracking } from '../../hooks/usePostHogTracking'

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

const SKELETON_ITEMS = Array.from({ length: 6 })
const TILE_ACTIONS: Array<{
  id: 'compile' | 'favorite' | 'like' | 'share'
  short: string
  label: string
  disabled?: boolean
}> = [
  { id: 'compile', short: 'Compile', label: 'Compile related research' },
  { id: 'favorite', short: 'Save', label: 'Favourite', disabled: true },
  { id: 'like', short: 'Appreciate', label: 'Appreciate', disabled: true },
  { id: 'share', short: 'Share', label: 'Share', disabled: true },
]

function formatAuthors(authors: string[]) {
  if (!authors.length) return 'Author information unavailable'
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`
}

function formatMeta(result: ApiSearchResult) {
  const items: string[] = []

  if (result.venue) {
    items.push(result.venue)
  }

  if (result.year) {
    items.push(String(result.year))
  }

  if (result.citationCount !== null && result.citationCount !== undefined) {
    items.push(`${result.citationCount} citations`)
  }

  return items.join(' · ')
}

function SearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tracking = usePostHogTracking()

  const [inputValue, setInputValue] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [results, setResults] = useState<ApiSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(false)
  const [compilingPaper, setCompilingPaper] = useState<string | null>(null)
  const [compileMessage, setCompileMessage] = useState('')

  const performSearch = useCallback(async (term: string) => {
    const trimmed = term.trim()

    if (!trimmed) {
      setActiveQuery('')
      setResults([])
      setCached(false)
      return
    }

    // Track search query
    const searchStartTime = Date.now()
    tracking.trackSearchQuery(trimmed)

    setLoading(true)
    setError('')
    setCached(false)
    setActiveQuery(trimmed)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmed }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message = typeof payload.error === 'string' ? payload.error : 'Unable to fetch results right now.'
        setError(message)
        setCached(false)

        // Track API error
        tracking.trackError('search_api_error', message, 'search_api_response')
        return
      }

      const payload = await response.json()
      const results = Array.isArray(payload.results) ? payload.results : []
      setResults(results)
      setCached(Boolean(payload.cached))

      // Track search results
      const searchDuration = Date.now() - searchStartTime
      tracking.trackSearchResults(trimmed, results.length, searchDuration)
    } catch (networkError) {
      console.error('Search request failed', networkError)
      setError('We could not reach the search service. Please try again.')
      setCached(false)

      // Track search error
      tracking.trackError('search_network_error', (networkError as Error).message, 'search_request')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const param = searchParams.get('q') ?? ''
    setInputValue(param)

    if (param && param !== activeQuery) {
      performSearch(param)
    }
  }, [searchParams, activeQuery, performSearch])

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = inputValue.trim()

      if (!trimmed) {
        setError('Enter a topic, paper title, or keywords to search.')
        return
      }

      setError('')
      router.replace(`/search?q=${encodeURIComponent(trimmed)}`, { scroll: false })
      performSearch(trimmed)
    },
    [inputValue, performSearch, router]
  )

  const handleCompile = async (paper: ApiSearchResult) => {
    setCompilingPaper(paper.id)
    setCompileMessage('Starting deep research...')

    // Track research compilation attempt
    tracking.trackResearchCompiled(paper.title, 1)

    try {
      const response = await fetch('/api/research/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paper }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setCompileMessage(errorData.message || 'Failed to compile research')
        return
      }

      const result = await response.json()

      if (result.success) {
        setCompileMessage(`✅ Created "${result.list.name}" with ${result.list.items_count} papers`)
        // Clear success message after 5 seconds
        setTimeout(() => {
          setCompileMessage('')
        }, 5000)
      } else {
        setCompileMessage(result.message || 'Research compilation failed')
      }

    } catch (error) {
      console.error('Compile error:', error)
      setCompileMessage('Network error during research compilation')
    } finally {
      setCompilingPaper(null)
      // Clear error messages after 8 seconds
      setTimeout(() => {
        if (compileMessage && !compileMessage.includes('✅')) {
          setCompileMessage('')
        }
      }, 8000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-6">
          <Link
            href="/"
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            ←
          </Link>
          <div>
            <p className="text-sm font-medium text-slate-500">Evidentia Explorer</p>
            <h1 className="text-lg font-semibold text-slate-900">Search academic literature</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Search papers, topics, or researchers"
            className="w-full flex-1 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            Search
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-3">
          <span className="text-sm text-slate-500">Include:</span>
          <button
            type="button"
            className="text-sm font-medium text-blue-600 underline decoration-blue-600/30 decoration-2 underline-offset-4 transition hover:decoration-blue-600"
          >
            Research
          </button>
          <button
            type="button"
            className="text-sm font-medium text-slate-400 transition hover:text-slate-600"
          >
            Grants
          </button>
          <button
            type="button"
            className="text-sm font-medium text-slate-400 transition hover:text-slate-600"
          >
            Patents
          </button>
        </div>

        <section className="mt-6 space-y-3">
          {activeQuery && (
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{activeQuery}</h2>
              <span className="text-sm text-slate-500">{results.length} results</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {compileMessage && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              compileMessage.includes('✅')
                ? 'border-green-100 bg-green-50 text-green-700'
                : compileMessage.includes('Starting')
                ? 'border-blue-100 bg-blue-50 text-blue-700'
                : 'border-red-100 bg-red-50 text-red-600'
            }`}>
              {compileMessage}
            </div>
          )}
        </section>

        <section className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {SKELETON_ITEMS.map((_, index) => (
                <div
                  key={index}
                  className="h-48 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                  <div className="mt-6 space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-4">
              {results.map((result) => (
                <article
                  key={result.id}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div>
                    <a
                      href={result.url ?? '#'}
                      target={result.url ? '_blank' : undefined}
                      rel={result.url ? 'noopener noreferrer' : undefined}
                      className="block text-base font-semibold text-slate-900 transition group-hover:text-blue-700"
                      onClick={() => tracking.trackPaperClicked(result.id, result.title, result.source)}
                    >
                      {result.title}
                    </a>
                    <p className="mt-3 text-sm text-slate-600">
                      {formatAuthors(result.authors)}
                    </p>
                    {formatMeta(result) && (
                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                        {formatMeta(result)}
                      </p>
                    )}
                    {/* Abstract hidden for list layout */}
                  </div>

                  <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                    {TILE_ACTIONS.map((action) => {
                      const isCompiling = action.id === 'compile' && compilingPaper === result.id
                      const isDisabled = action.disabled || isCompiling

                      return (
                        <button
                          key={action.id}
                          type="button"
                          disabled={isDisabled}
                          className={`flex items-center justify-center rounded-xl border px-4 py-2 text-xs font-semibold shadow-[0px_4px_12px_rgba(71,85,105,0.12)] transition ${
                            isDisabled
                              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 shadow-none'
                              : 'border-slate-200/70 bg-white text-slate-900 hover:-translate-y-0.5 hover:border-slate-300'
                          }`}
                          onClick={() => {
                            if (isDisabled) return
                            if (action.id === 'compile') {
                              handleCompile(result)
                            } else {
                              console.log(`${action.label} clicked for`, result.id)
                            }
                          }}
                        >
                          <span>
                            {isCompiling ? 'Researching...' : action.short}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : activeQuery ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              No results yet. Try refining your keywords or searching for a different topic.
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              Start by entering a topic above to explore the latest papers.
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="animate-pulse">
            <div className="h-16 bg-slate-200 rounded-2xl mb-8"></div>
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 bg-slate-200 rounded-2xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
