export interface ListPaperPayload {
  id: string
  title: string
  abstract?: string | null
  authors?: string[]
  year?: number | null
  venue?: string | null
  citationCount?: number | null
  semanticScholarId?: string | null
  arxivId?: string | null
  doi?: string | null
  url?: string | null
  source?: string | null
  publicationDate?: string | null
}

export interface BasicListInfo {
  id: number
  name: string
}

type SaveStatus = 'saved' | 'already-in-list' | 'failed'

export interface SavePaperResult {
  listId: number | null
  status: SaveStatus
  error?: string
}

const VERIFY_LIST_PREFIX = 'VERIFY - '
const MAX_LIST_NAME_LENGTH = 120

function buildPrefixedListName(prefix: string, title: string): string {
  const normalizedTitle = title.trim().replace(/\s+/g, ' ')
  const maxTitleLength = Math.max(MAX_LIST_NAME_LENGTH - prefix.length, 16)
  const truncatedTitle = normalizedTitle.length > maxTitleLength
    ? normalizedTitle.slice(0, maxTitleLength - 3) + '...'
    : normalizedTitle
  return `${prefix}${truncatedTitle}`
}

export function buildVerifyListName(title: string): string {
  return buildPrefixedListName(VERIFY_LIST_PREFIX, title)
}

export function buildCompileListName(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) {
    return 'Untitled Research List'
  }
  const maxLength = Math.max(MAX_LIST_NAME_LENGTH, 16)
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed
}

interface SavePaperToNamedListOptions {
  listName: string
  paper: ListPaperPayload
  existingLists?: BasicListInfo[]
}

async function fetchLists(): Promise<BasicListInfo[] | null> {
  try {
    const response = await fetch('/api/lists')
    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (!Array.isArray(data.lists)) {
      return []
    }

    return data.lists
      .map((list: any) => ({
        id: typeof list.id === 'number' ? list.id : Number(list.id),
        name: typeof list.name === 'string' ? list.name : ''
      }))
      .filter((list: BasicListInfo) => Number.isFinite(list.id) && list.name)
  } catch (error) {
    console.error('Failed to fetch lists:', error)
    return null
  }
}

export async function savePaperToNamedList({ listName, paper, existingLists }: SavePaperToNamedListOptions): Promise<SavePaperResult> {
  const targetName = listName.trim()
  if (!targetName) {
    return { listId: null, status: 'failed', error: 'List name is required' }
  }

  let lists: BasicListInfo[] | undefined = existingLists?.length ? existingLists : undefined
  let listsFetched = false

  const ensureLists = async () => {
    if (!listsFetched) {
      const fetched = await fetchLists()
      listsFetched = true
      lists = fetched ?? []
    }
    return lists ?? []
  }

  const findList = async (): Promise<BasicListInfo | null> => {
    if (lists?.length) {
      const match = lists.find((list) => list.name === targetName)
      if (match) {
        return match
      }
    }

    const refreshed = await ensureLists()
    return refreshed.find((list) => list.name === targetName) ?? null
  }

  let listInfo = await findList()

  if (!listInfo) {
    const createResponse = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: targetName })
    })

    if (createResponse.ok) {
      const payload = await createResponse.json().catch(() => null)
      if (payload?.list?.id) {
        listInfo = {
          id: typeof payload.list.id === 'number' ? payload.list.id : Number(payload.list.id),
          name: targetName
        }
        lists = lists ? [...lists, listInfo] : [listInfo]
      }
    } else {
      const errorData = await createResponse.json().catch(() => ({}))
      if (errorData?.error === 'A list with this name already exists') {
        listInfo = await findList()
      } else {
        const errorMessage = typeof errorData?.error === 'string'
          ? errorData.error
          : `Failed to create list (status ${createResponse.status})`
        return { listId: null, status: 'failed', error: errorMessage }
      }
    }
  }

  if (!listInfo) {
    return { listId: null, status: 'failed', error: 'Unable to locate list' }
  }

  try {
    const saveResponse = await fetch(`/api/lists/${listInfo.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper })
    })

    if (saveResponse.ok) {
      return { listId: listInfo.id, status: 'saved' }
    }

    const errorData = await saveResponse.json().catch(() => ({}))
    if (errorData?.error === 'Paper is already in this list') {
      return { listId: listInfo.id, status: 'already-in-list' }
    }

    const errorMessage = typeof errorData?.error === 'string'
      ? errorData.error
      : `Failed to save paper (status ${saveResponse.status})`

    return { listId: listInfo.id, status: 'failed', error: errorMessage }
  } catch (error) {
    console.error('Failed to save paper to list:', error)
    return {
      listId: listInfo.id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
