'use client'

import { useEffect, useState } from 'react'

interface UserList {
  id: number
  name: string
  items_count?: number
  status?: 'loading' | 'ready'
}

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

interface SaveToListModalProps {
  isOpen: boolean
  paper: ApiSearchResult | null
  onClose: () => void
  onSaved: () => void
  userLists: UserList[]
  setUserLists: (lists: UserList[]) => void
}

const MODAL_CONTAINER_CLASSES = 'fixed inset-0 z-50 flex items-center justify-center px-4 py-4 overflow-y-auto'
const MODAL_BACKDROP_CLASSES = 'absolute inset-0 bg-slate-900/40 backdrop-blur-sm'
const MODAL_PANEL_CLASSES = 'relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)] my-4'
const MODAL_HEADER_CLASSES = 'text-center'
const MODAL_TITLE_CLASSES = 'text-xl font-semibold text-slate-900'
const CLOSE_BUTTON_CLASSES = 'absolute right-4 top-4 rounded-full border border-slate-200 p-1.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-700'
const RADIO_CONTAINER_CLASSES = 'space-y-3'
const RADIO_LABEL_CLASSES = 'flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300 cursor-pointer'
const RADIO_INPUT_CLASSES = 'h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500'
const NEW_LIST_INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
const BUTTON_PRIMARY_CLASSES = 'inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60'
const BUTTON_SECONDARY_CLASSES = 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900'

export function SaveToListModal({ isOpen, paper, onClose, onSaved, userLists, setUserLists }: SaveToListModalProps) {
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')


  // Reset modal state when it opens
  useEffect(() => {
    if (isOpen) {
      setError('')
      setSuccess('')
      setNewListName('')
      setIsCreatingNew(false)
      setSelectedListId(null)
    }
  }, [isOpen])

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


  const handleSave = async () => {
    if (!paper) return

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      let targetListId = selectedListId

      // Create new list if needed
      if (isCreatingNew) {
        const trimmedName = newListName.trim()
        if (!trimmedName) {
          setError('Please enter a list name')
          setLoading(false)
          return
        }

        const createResponse = await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedName })
        })

        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}))
          setError(errorData.error || 'Failed to create list')
          setLoading(false)
          return
        }

        const { list } = await createResponse.json()
        targetListId = list.id

        // Add the new list to the userLists state (we'll increment count after saving paper)
        setUserLists(prevLists => [...prevLists, {
          id: list.id,
          name: list.name,
          items_count: 0,
          status: 'ready'
        }])
      }

      if (!targetListId) {
        setError('Please select a list or create a new one')
        setLoading(false)
        return
      }

      // Save paper to list
      const saveResponse = await fetch(`/api/lists/${targetListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper })
      })

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({}))
        setError(errorData.error || 'Failed to save paper')
        setLoading(false)
        return
      }

      // Optimistically update the list count
      setUserLists(prevLists => prevLists.map(list =>
        list.id === targetListId
          ? { ...list, items_count: (list.items_count || 0) + 1 }
          : list
      ))

      setSuccess('Paper saved successfully!')
      setTimeout(() => {
        onSaved()
        onClose()
      }, 2000)

    } catch (error) {
      console.error('Save failed:', error)
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
        <button
          type="button"
          onClick={onClose}
          className={CLOSE_BUTTON_CLASSES}
          aria-label="Close modal"
        >
          ×
        </button>

        <div className={MODAL_HEADER_CLASSES}>
          <h2 className={MODAL_TITLE_CLASSES}>Save to List</h2>
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

          <div className={RADIO_CONTAINER_CLASSES}>
            {userLists.map((list) => (
              <label key={list.id} className={RADIO_LABEL_CLASSES}>
                <input
                  type="radio"
                  name="list"
                  value={list.id}
                  checked={selectedListId === list.id && !isCreatingNew}
                  onChange={() => {
                    setSelectedListId(list.id)
                    setIsCreatingNew(false)
                  }}
                  className={RADIO_INPUT_CLASSES}
                />
                <span className="flex-1 text-sm font-medium text-slate-900">
                  {list.name}
                </span>
                {list.items_count !== undefined && (
                  <span className="text-xs text-slate-500">
                    {list.items_count} item{list.items_count === 1 ? '' : 's'}
                  </span>
                )}
              </label>
            ))}

            <label className={RADIO_LABEL_CLASSES}>
              <input
                type="radio"
                name="list"
                value="new"
                checked={isCreatingNew}
                onChange={() => {
                  setIsCreatingNew(true)
                  setSelectedListId(null)
                }}
                className={RADIO_INPUT_CLASSES}
              />
              <span className="text-sm font-medium text-slate-900">
                Create new list
              </span>
            </label>

            {isCreatingNew && (
              <div className="ml-7">
                <input
                  type="text"
                  placeholder="Enter list name..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className={NEW_LIST_INPUT_CLASSES}
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={BUTTON_SECONDARY_CLASSES}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || (!selectedListId && !isCreatingNew)}
              className={`${BUTTON_PRIMARY_CLASSES} flex-1`}
            >
              {loading ? 'Saving...' : 'Save to List'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
