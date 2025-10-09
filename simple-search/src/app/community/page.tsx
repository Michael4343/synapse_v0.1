'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PaperDiscussion } from '@/lib/discussion-types'
import { formatRelativeTime } from '@/lib/date-utils'

interface CommunityFeedResponse {
  entries: PaperDiscussion[]
}

const ENTRY_BADGE_CLASSES: Record<string, string> = {
  share: 'bg-sky-100 text-sky-700',
  question: 'bg-amber-100 text-amber-700'
}

export default function CommunityFeedPage() {
  const [entries, setEntries] = useState<PaperDiscussion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const fetchFeed = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/community-feed?limit=30', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Unable to load the community feed right now.')
        }
        const data = await response.json() as CommunityFeedResponse
        if (isMounted && data?.entries) {
          setEntries(data.entries)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unexpected error loading community feed.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void fetchFeed()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900">
            ← Back to feed
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900">Community insights</h1>
          <p className="text-sm text-slate-600">
            Quick takes and open questions from researchers exploring the latest papers. Post from any paper detail to join the conversation.
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Loading community activity…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            No community posts yet. Visit a paper detail to share an insight or ask a question.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const badgeClass = ENTRY_BADGE_CLASSES[entry.entryType] ?? 'bg-slate-100 text-slate-600'
              return (
                <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${badgeClass}`}>
                        {entry.entryType === 'share' ? 'Community share' : 'Open question'}
                      </span>
                      <span>{formatRelativeTime(entry.createdAt)}</span>
                    </div>
                    <Link href={`/papers/${entry.paperLookupId}`} className="text-lg font-semibold text-slate-900 transition hover:text-slate-600">
                      {entry.paperTitle}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {entry.paperAuthors.length ? entry.paperAuthors.join(', ') : 'Author information unavailable.'}
                    </p>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {entry.content}
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <Link
                        href={`/papers/${entry.paperLookupId}`}
                        className="font-medium text-sky-600 transition hover:text-sky-500"
                      >
                        View paper and discussion →
                      </Link>
                      {entry.paperUrl && (
                        <a
                          href={entry.paperUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 transition hover:text-slate-700"
                        >
                          Source link
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
