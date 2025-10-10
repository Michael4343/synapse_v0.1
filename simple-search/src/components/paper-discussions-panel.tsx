'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiscussionEntryType, PaperDiscussion } from '@/lib/discussion-types'
import { formatRelativeTime } from '@/lib/date-utils'

interface PaperDiscussionsPanelProps {
  paperId: string
  paperTitle: string
  paperAuthors: string[]
  paperUrl?: string | null
  currentUserId?: string | null
  currentUserDisplayName?: string | null
  onRequireLogin?: () => void
}

type ComposerTab = 'share' | 'question'

interface ComposerState {
  share: string
  question: string
  answer: Record<string, string>
  notifyOnAnswer: boolean
}

const MAX_LENGTH = 500

function autoResize(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return
  }
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

function characterCountClass(count: number) {
  if (count > MAX_LENGTH) {
    return 'text-rose-500'
  }
  if (count > MAX_LENGTH * 0.85) {
    return 'text-amber-600'
  }
  return 'text-slate-500'
}

export function PaperDiscussionsPanel({
  paperId,
  paperTitle,
  paperAuthors,
  paperUrl = null,
  currentUserId,
  currentUserDisplayName,
  onRequireLogin
}: PaperDiscussionsPanelProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const [activeTab, setActiveTab] = useState<ComposerTab>('share')
  const [composerState, setComposerState] = useState<ComposerState>({
    share: '',
    question: '',
    answer: {},
    notifyOnAnswer: true
  })
  const [entries, setEntries] = useState<PaperDiscussion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const fetchEntries = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/papers/${paperId}/discussions`)
        if (!response.ok) {
          throw new Error('Unable to load community activity yet.')
        }
        const data = await response.json()
        if (isMounted && data?.entries) {
          setEntries(data.entries)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unexpected error loading discussions.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void fetchEntries()

    return () => {
      isMounted = false
    }
  }, [paperId])

  useEffect(() => {
    setComposerState({ share: '', question: '', answer: {}, notifyOnAnswer: true })
    setSuccessMessage('')
    setActiveTab('share')
  }, [paperId])

  useEffect(() => {
    autoResize(composerRef.current)
  }, [activeTab, composerState.share, composerState.question])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    Object.keys(composerState.answer).forEach((replyId) => {
      const textarea = document.querySelector<HTMLTextAreaElement>(`textarea[data-discussion-reply="${replyId}"]`)
      autoResize(textarea)
    })
  }, [composerState.answer])

  const rootEntries = useMemo(
    () => entries.filter((entry) => !entry.replyToId),
    [entries]
  )

  const answersByParent = useMemo(() => {
    return entries.reduce<Record<string, PaperDiscussion[]>>((acc, entry) => {
      if (entry.replyToId) {
        acc[entry.replyToId] = acc[entry.replyToId] ? [...acc[entry.replyToId], entry] : [entry]
      }
      return acc
    }, {})
  }, [entries])

  const shareEntries = useMemo(
    () => rootEntries.filter((entry) => entry.entryType === 'share').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rootEntries]
  )

  const questionEntries = useMemo(
    () => rootEntries.filter((entry) => entry.entryType === 'question').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rootEntries]
  )

  const handleTabChange = (tab: ComposerTab) => {
    setActiveTab(tab)
    setSuccessMessage('')
  }

  const handleSubmit = async (entryType: DiscussionEntryType, replyToId?: string) => {
    if (!currentUserId) {
      onRequireLogin?.()
      return
    }

    let draft = ''
    if (entryType === 'share') {
      draft = composerState.share
    } else if (entryType === 'question') {
      draft = composerState.question
    } else if (entryType === 'answer') {
      draft = composerState.answer[replyToId ?? ''] ?? ''
    }

    const trimmed = draft.trim()

    if (!trimmed) {
      setError('Please add a short message before posting.')
      return
    }

    if (trimmed.length > MAX_LENGTH) {
      setError(`Keep it concise—${MAX_LENGTH} characters max.`)
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const payload = {
        entryType,
        content: trimmed,
        structuredPayload: entryType === 'question' ? { notifyOnAnswer: composerState.notifyOnAnswer } : {},
        replyToId: entryType === 'answer' ? replyToId ?? null : null,
        paperTitle,
        paperAuthors,
        paperUrl,
        authorDisplayName: currentUserDisplayName ?? null
      }

      const response = await fetch(`/api/papers/${paperId}/discussions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error ?? 'Unable to post right now.')
      }

      const createdEntry: PaperDiscussion = await response.json()
      setEntries((prev) => [...prev, createdEntry])

      if (entryType === 'share') {
        setComposerState((prev) => ({ ...prev, share: '' }))
        setSuccessMessage('Shared with the community!')
      } else if (entryType === 'question') {
        setComposerState((prev) => ({ ...prev, question: '' }))
        setSuccessMessage('Question posted—keep an eye on the feed for replies.')
      } else if (entryType === 'answer' && replyToId) {
        setComposerState((prev) => ({
          ...prev,
          answer: { ...prev.answer, [replyToId]: '' }
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error while posting.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAnswerDraftChange = (parentId: string, value: string) => {
    setComposerState((prev) => ({
      ...prev,
      answer: { ...prev.answer, [parentId]: value }
    }))
  }

  const renderEntry = (entry: PaperDiscussion) => {
    const answers = answersByParent[entry.id] ?? []
    const isCurrentUsers = entry.userId && entry.userId === currentUserId
    const replyDraft = composerState.answer[entry.id] ?? ''
    const replyButtonLabel = entry.entryType === 'question' ? 'Answer' : 'Comment'

    return (
      <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-slate-700">
            {entry.authorDisplayName || (isCurrentUsers ? 'You' : 'Community member')}
          </span>
          <span>{formatRelativeTime(entry.createdAt)}</span>
        </header>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {entry.content}
        </div>
        {answers.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {answers
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map((answer) => {
                const answerIsCurrentUser = answer.userId && answer.userId === currentUserId
                return (
                  <div key={answer.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
                      <span className="font-semibold text-slate-600">
                        {answer.authorDisplayName || (answerIsCurrentUser ? 'You' : 'Community member')}
                      </span>
                      <span>{formatRelativeTime(answer.createdAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-slate-700">{answer.content}</div>
                  </div>
                )
              })}
          </div>
        )}
        {entry.entryType !== 'answer' && (
          <div className="mt-4 space-y-2">
            <textarea
              value={replyDraft}
              onChange={(event) => {
                autoResize(event.currentTarget)
                handleAnswerDraftChange(entry.id, event.target.value)
              }}
              onFocus={(event) => autoResize(event.currentTarget)}
              placeholder={entry.entryType === 'question' ? 'Share a quick answer' : 'Add your take'}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none overflow-hidden"
              rows={1}
              data-discussion-reply={entry.id}
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs ${characterCountClass(replyDraft.length)}`}>
                {replyDraft.length} / {MAX_LENGTH}
              </span>
              <button
                type="button"
                onClick={() => handleSubmit('answer', entry.id)}
                disabled={submitting}
                className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Posting…' : replyButtonLabel}
              </button>
            </div>
          </div>
        )}
      </article>
    )
  }

  const composerContent = activeTab === 'share' ? composerState.share : composerState.question

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <button
            type="button"
            onClick={() => handleTabChange('share')}
            className={`flex-1 rounded-full px-3 py-1.5 transition ${activeTab === 'share' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-700'}`}
          >
            Share insight
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('question')}
            className={`flex-1 rounded-full px-3 py-1.5 transition ${activeTab === 'question' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-700'}`}
          >
            Ask question
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <textarea
            value={composerContent}
            onChange={(event) => {
              const { value } = event.target
              autoResize(event.currentTarget)
              setComposerState((prev) => ({
                ...prev,
                [activeTab]: value
              }))
            }}
            onFocus={(event) => autoResize(event.currentTarget)}
            placeholder={activeTab === 'share' ? 'Share your wisdom for science!' : 'What do you want the community to weigh in on?'}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none overflow-hidden"
            rows={1}
            ref={composerRef}
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className={characterCountClass(composerContent.length)}>
              {composerContent.length} / {MAX_LENGTH}
            </span>
            <div className="flex items-center gap-3">
              {activeTab === 'question' && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={composerState.notifyOnAnswer}
                    onChange={(event) => setComposerState((prev) => ({ ...prev, notifyOnAnswer: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  Notify me when someone replies
                </label>
              )}
              <button
                type="button"
                onClick={() => handleSubmit(activeTab)}
                disabled={submitting}
                className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Posting…' : activeTab === 'share' ? 'Share' : 'Ask'}
              </button>
            </div>
          </div>
          {successMessage && (
            <p className="text-xs text-emerald-600">
              <span className="font-medium">{successMessage}</span>
              {' '}
              <Link href="/community" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                View the community feed
              </Link>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-slate-500">Loading community activity…</div>
        ) : (
          <>
            {shareEntries.length === 0 && questionEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Be the first to share a takeaway or ask the community a question about this paper.
              </div>
            ) : (
              <div className="space-y-6">
                {shareEntries.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Community shares</h3>
                    <div className="space-y-3">
                      {shareEntries.map(renderEntry)}
                    </div>
                  </div>
                )}

                {questionEntries.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Questions and answers</h3>
                    <div className="space-y-3">
                      {questionEntries.map(renderEntry)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
