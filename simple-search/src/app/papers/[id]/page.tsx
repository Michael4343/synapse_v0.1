'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface PaperDetails {
  id: string
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  venue: string | null
  citation_count: number | null
  doi: string | null
  url: string | null
  scrapedContent: string | null
}

function formatAuthors(authors: string[]) {
  if (!authors || authors.length === 0) return 'Author information unavailable'
  if (authors.length <= 5) return authors.join(', ')
  return `${authors.slice(0, 5).join(', ')} et al.`
}

function PaperDetailPage() {
  const params = useParams()
  const paperId = params.id as string
  const [paper, setPaper] = useState<PaperDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (paperId) {
      const fetchPaper = async () => {
        setLoading(true)
        setError('')
        try {
          const response = await fetch(`/api/papers/${paperId}`)
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to fetch paper details')
          }
          const data = await response.json()
          setPaper(data)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setLoading(false)
        }
      }
      fetchPaper()
    }
  }, [paperId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-6">
            <Link
              href="/search"
              className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              ←
            </Link>
            <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="space-y-6">
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-96 w-full animate-pulse rounded-xl bg-slate-100" />
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-6">
            <Link
              href="/search"
              className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              ←
            </Link>
            <h1 className="text-lg font-semibold text-red-600">Error</h1>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        </main>
      </div>
    )
  }

  if (!paper) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:gap-6">
          <Link
            href="/search"
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            ←
          </Link>
          <div>
            <p className="text-sm font-medium text-slate-500">Paper Details</p>
            <h1 className="text-lg font-semibold text-slate-900">{paper.title}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">{paper.title}</h2>
          <p className="mt-3 text-sm text-slate-600">{formatAuthors(paper.authors)}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            {paper.venue && <span>{paper.venue}</span>}
            {paper.year && <span>{paper.year}</span>}
            {paper.citation_count !== null && <span>{paper.citation_count} citations</span>}
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {paper.doi}
              </a>
            )}
          </div>

          {paper.abstract && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-800">Abstract</h3>
              <p className="mt-2 text-base text-slate-700 leading-relaxed">{paper.abstract}</p>
            </div>
          )}

          <div className="mt-8">
            <button
              type="button"
              disabled
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed"
            >
              Email Author for Paper
            </button>
          </div>

          {paper.scrapedContent ? (
            <div className="prose prose-slate mt-8 max-w-none">
              <h3 className="text-lg font-semibold text-slate-800">Full Paper</h3>
              <div dangerouslySetInnerHTML={{ __html: paper.scrapedContent.replace(/\n/g, '<br />') }} />
            </div>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              <p>Full paper content is not available.</p>
              {paper.doi && <p className="mt-2">This may be due to a paywall or other access restrictions.</p>}
            </div>
          )}
        </article>
      </main>
    </div>
  )
}

export default PaperDetailPage
