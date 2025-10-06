'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/lib/auth-context'
import { useAuthModal } from '@/lib/auth-hooks'
import { AuthModal } from '@/components/auth-modal'
import { VerificationModal } from '@/components/verification-modal'
import { buildVerifyListName, savePaperToNamedList } from '@/lib/list-actions'
import type { ListPaperPayload } from '@/lib/list-actions'

interface PaperSection {
  type: string
  title: string
  content: string
}

interface ProcessedContent {
  title: string
  sections: PaperSection[]
  metadata: {
    processed_successfully: boolean
    content_quality: string
  }
}

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
  processedContent: string | null
  contentQuality: 'full_paper' | 'abstract_only' | 'insufficient' | null
  contentType: 'html' | 'pdf' | 'abstract' | 'other' | null
  scrapedUrl: string | null
}

function buildVerificationPayload(paper: PaperDetails) {
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    abstract: paper.abstract,
    year: paper.year,
    venue: paper.venue,
    citation_count: paper.citation_count,
    doi: paper.doi,
    url: paper.url,
    scraped_url: paper.scrapedUrl,
    content_quality: paper.contentQuality,
    content_type: paper.contentType
  }
}

function buildListPayloadFromDetails(paper: PaperDetails): ListPaperPayload {
  return {
    id: paper.id,
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    citationCount: paper.citation_count,
    semanticScholarId: paper.id,
    arxivId: null,
    doi: paper.doi,
    url: paper.url,
    source: 'paper-detail',
    publicationDate: paper.year ? `${paper.year}-01-01` : null
  }
}

function formatAuthors(authors: string[]) {
  if (!authors || authors.length === 0) return 'Author information unavailable'
  if (authors.length <= 5) return authors.join(', ')
  return `${authors.slice(0, 5).join(', ')} et al.`
}

function getSectionIcon(type: string): string {
  switch (type) {
    case 'abstract': return '📄'
    case 'introduction': return '🚀'
    case 'methods': return '🔬'
    case 'results': return '📊'
    case 'discussion': return '💭'
    case 'conclusion': return '🎯'
    case 'related_work': return '📚'
    case 'background': return '🏗️'
    case 'evaluation': return '⚖️'
    case 'limitations': return '⚠️'
    case 'future_work': return '🔮'
    default: return '📝'
  }
}

function getContentQualityBadge(quality: string | null, contentType: string | null): React.JSX.Element | null {
  if (!quality) return null

  const badgeClasses = {
    full_paper: 'bg-green-100 text-green-700',
    abstract_only: 'bg-amber-100 text-amber-700',
    insufficient: 'bg-red-100 text-red-700'
  }

  const contentTypeLabels = {
    html: 'HTML',
    pdf: 'PDF',
    abstract: 'Abstract',
    other: 'Other'
  }

  const qualityLabels = {
    full_paper: 'Full Paper',
    abstract_only: 'Abstract Only',
    insufficient: 'Insufficient'
  }

  const className = badgeClasses[quality as keyof typeof badgeClasses] || 'bg-slate-100 text-slate-600'
  const qualityLabel = qualityLabels[quality as keyof typeof qualityLabels] || quality
  const typeLabel = contentType ? contentTypeLabels[contentType as keyof typeof contentTypeLabels] || contentType : ''

  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${className}`}>
      {qualityLabel}{typeLabel && ` (${typeLabel})`}
    </span>
  )
}

function PaperSection({ section }: { section: PaperSection }) {
  const icon = getSectionIcon(section.type)

  return (
    <section className="border-b border-slate-200 last:border-b-0 pb-6 last:pb-0">
      <h3 className="flex items-center gap-2 text-xl font-semibold text-slate-800 mb-4">
        <span className="text-lg">{icon}</span>
        {section.title}
      </h3>
      <div className="prose prose-slate prose-lg max-w-none prose-headings:text-slate-800 prose-h4:text-lg prose-h5:text-base prose-h6:text-sm prose-p:text-slate-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-slate-800 prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-strong:text-slate-800 prose-em:text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {section.content}
        </ReactMarkdown>
      </div>
    </section>
  )
}

function ProcessedPaperContent({ processedContent }: { processedContent: string }) {
  console.log('ProcessedPaperContent called with:', processedContent?.slice(0, 200) + '...')

  try {
    const parsed: ProcessedContent = JSON.parse(processedContent)
    console.log('Parsed JSON successfully:', parsed)

    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      console.error('Invalid sections structure:', parsed.sections)
      throw new Error('Invalid section structure')
    }

    // Filter out empty sections and count valid ones
    const validSections = parsed.sections.filter(section => section.content && section.content.trim().length > 0)
    console.log('Valid sections found:', validSections.length, 'out of', parsed.sections.length)

    if (validSections.length === 0) {
      console.warn('No sections with content found')
      throw new Error('No valid sections with content')
    }

    return (
      <div className="mt-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-slate-800">Structured Paper Content</h3>
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${
            parsed.metadata?.content_quality === 'high'
              ? 'bg-green-100 text-green-700'
              : parsed.metadata?.content_quality === 'medium'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-slate-100 text-slate-600'
          }`}>
            {parsed.metadata?.content_quality || 'processed'} quality
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
          {validSections.map((section, index) => (
            <div key={index} className="p-6">
              <PaperSection section={section} />
            </div>
          ))}
        </div>
      </div>
    )
  } catch (error) {
    console.error('Failed to parse processed content:', error)
    console.error('Raw content that failed:', processedContent)
    return (
      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-700">
          Unable to parse structured content. Falling back to raw content display.
        </p>
        <details className="mt-2">
          <summary className="text-xs cursor-pointer">Debug Info</summary>
          <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-40">
            Error: {error instanceof Error ? error.message : String(error)}
            {'\n'}
            Content: {processedContent?.slice(0, 500)}...
          </pre>
        </details>
      </div>
    )
  }
}

function PaperDetailPage() {
  const params = useParams()
  const paperId = params.id as string
  const { user } = useAuth()
  const authModal = useAuthModal()
  const [paper, setPaper] = useState<PaperDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verificationModalOpen, setVerificationModalOpen] = useState(false)
  const [activeVerification, setActiveVerification] = useState<'claims' | 'reproducibility' | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [verificationError, setVerificationError] = useState('')
  const isVerificationSending = verificationStatus === 'sending'

  const handleVerificationClick = async (type: 'claims' | 'reproducibility') => {
    if (!paper) {
      return
    }

    if (!user) {
      authModal.openLogin()
      return
    }

    setActiveVerification(type)
    setVerificationError('')
    setVerificationStatus('sending')
    setVerificationModalOpen(true)

    try {
      const response = await fetch(`/api/papers/${paper.id}/verification-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          verificationType: type,
          paper: buildVerificationPayload(paper)
        })
      })

      if (!response.ok) {
        let message = 'Failed to submit verification request. Please try again.'
        try {
          const errorData = await response.json()
          if (errorData?.error) {
            message = errorData.error
          }
        } catch (parseError) {
          console.error('Failed to parse verification error response:', parseError)
        }
        setVerificationError(message)
        setVerificationStatus('error')
        return
      }

      void savePaperToNamedList({
        listName: buildVerifyListName(paper.title),
        paper: buildListPayloadFromDetails(paper)
      }).then((result) => {
        if (result.status === 'failed' && result.error) {
          console.error('Failed to add paper to VERIFY list:', result.error)
        }
      })

      setVerificationStatus('success')
    } catch (requestError) {
      console.error('Verification request failed:', requestError)
      setVerificationError(requestError instanceof Error ? requestError.message : 'Unexpected error submitting verification request.')
      setVerificationStatus('error')
    }
  }

  const handleVerificationModalClose = () => {
    setVerificationModalOpen(false)
    setActiveVerification(null)
    setVerificationStatus('idle')
    setVerificationError('')
  }

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
          console.log('Paper data received:', data)
          console.log('Has processedContent:', !!data.processedContent)
          console.log('Has scrapedContent:', !!data.scrapedContent)
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
              href="/"
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
              href="/"
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

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => handleVerificationClick('claims')}
              disabled={loading || isVerificationSending}
              title={!user ? 'Sign in to request verification' : undefined}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              VERIFY CLAIMS
            </button>
            <button
              type="button"
              onClick={() => handleVerificationClick('reproducibility')}
              disabled={loading || isVerificationSending}
              title={!user ? 'Sign in to request verification' : undefined}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              VERIFY REPRODUCIBILITY
            </button>
          </div>

          {paper.processedContent ? (
            <ProcessedPaperContent processedContent={paper.processedContent} />
          ) : paper.scrapedContent ? (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">
                  {paper.contentQuality === 'full_paper' ? 'Full Paper (Raw Content)' : 'Paper Content'}
                </h3>
                {getContentQualityBadge(paper.contentQuality, paper.contentType)}
              </div>
              <div className="prose prose-slate prose-lg max-w-none prose-headings:text-slate-900 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-slate-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:text-slate-800 prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-table:text-sm prose-th:bg-slate-50 prose-td:border-slate-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-8 mb-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-800 mt-6 mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-700 mt-4 mb-2">{children}</h3>,
                    p: ({ children }) => <p className="text-slate-700 leading-relaxed mb-4">{children}</p>,
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '')
                      return match ? (
                        <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto">
                          <code className="text-sm text-slate-800" {...props}>{children}</code>
                        </pre>
                      ) : (
                        <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
                      )
                    },
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-blue-500 bg-blue-50 py-2 px-4 my-4 italic">{children}</blockquote>
                    ),
                  }}
                >
                  {paper.scrapedContent}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              <div className="flex items-center justify-center gap-2 mb-2">
                <p>Full paper content is not available.</p>
                {paper.contentQuality && getContentQualityBadge(paper.contentQuality, paper.contentType)}
              </div>
              {paper.doi && <p className="mt-2">This may be due to a paywall or other access restrictions.</p>}
              {paper.scrapedUrl && (
                <p className="mt-2 text-xs text-slate-400">
                  Attempted to scrape from: {paper.scrapedUrl}
                </p>
              )}
            </div>
          )}
        </article>
      </main>
      <VerificationModal
        isOpen={verificationModalOpen}
        type={activeVerification}
        status={verificationStatus}
        errorMessage={verificationError}
        onClose={handleVerificationModalClose}
      />
      <AuthModal
        isOpen={authModal.isOpen}
        mode={authModal.mode}
        onClose={authModal.close}
        onSwitchMode={authModal.switchMode}
      />
    </div>
  )
}

export default PaperDetailPage
