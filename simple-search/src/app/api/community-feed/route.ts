import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'
import type { DiscussionEntryType } from '@/lib/discussion-types'

interface DiscussionRow {
  id: string
  paper_id: string | null
  paper_lookup_id: string
  paper_title: string
  paper_authors: string[] | null
  paper_url: string | null
  user_id: string | null
  entry_type: DiscussionEntryType
  content: string
  structured_payload: Record<string, unknown> | null
  reply_to_id: string | null
  author_display_name: string | null
  created_at: string
  updated_at: string
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function mapRow(row: DiscussionRow) {
  return {
    id: row.id,
    paperLookupId: row.paper_lookup_id,
    paperId: row.paper_id,
    paperTitle: row.paper_title,
    paperAuthors: Array.isArray(row.paper_authors) ? row.paper_authors : [],
    paperUrl: row.paper_url,
    userId: row.user_id,
    entryType: row.entry_type,
    content: row.content,
    structuredPayload: row.structured_payload ?? {},
    replyToId: row.reply_to_id,
    authorDisplayName: row.author_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const paperIdFilter = searchParams.get('paperId')

    let limit = DEFAULT_LIMIT
    if (limitParam) {
      const parsed = Number.parseInt(limitParam, 10)
      if (!Number.isNaN(parsed)) {
        limit = Math.max(1, Math.min(parsed, MAX_LIMIT))
      }
    }

    const query = supabaseAdmin
      .from(TABLES.PAPER_DISCUSSIONS)
      .select(
        'id, paper_id, paper_lookup_id, paper_title, paper_authors, paper_url, user_id, entry_type, content, structured_payload, reply_to_id, author_display_name, created_at, updated_at'
      )
      .is('reply_to_id', null)
      .in('entry_type', ['share', 'question'])
      .order('created_at', { ascending: false })
      .limit(limit)

    if (paperIdFilter) {
      query.eq('paper_lookup_id', paperIdFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to load community feed entries:', error)
      return NextResponse.json({ error: 'Unable to load community feed' }, { status: 500 })
    }

    const entries = Array.isArray(data) ? data.map(mapRow) : []

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('Unexpected error in community feed API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
