export type DiscussionEntryType = 'share' | 'question' | 'answer'

export interface PaperDiscussion {
  id: string
  paperLookupId: string
  paperId: string | null
  paperTitle: string
  paperAuthors: string[]
  paperUrl: string | null
  userId: string | null
  entryType: DiscussionEntryType
  content: string
  structuredPayload: Record<string, unknown>
  replyToId: string | null
  authorDisplayName: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateDiscussionPayload {
  entryType: DiscussionEntryType
  content: string
  structuredPayload?: Record<string, unknown>
  replyToId?: string | null
  paperTitle: string
  paperAuthors: string[]
  paperUrl?: string | null
  authorDisplayName?: string | null
}

export interface DiscussionsResponse {
  entries: PaperDiscussion[]
}
