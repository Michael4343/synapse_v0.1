import { NextRequest, NextResponse } from 'next/server'
import { createClient, supabaseAdmin } from '@/lib/supabase-server'
import { TABLES } from '@/lib/supabase'
import type { DiscussionEntryType } from '@/lib/discussion-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_CONTENT_LENGTH = 1000
const ALLOWED_ENTRY_TYPES: DiscussionEntryType[] = ['share', 'question', 'answer']

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

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function mapRowToPayload(row: DiscussionRow) {
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

function sanitizeContent(content: unknown): string {
  if (typeof content !== 'string') {
    return ''
  }
  return content.trim()
}

function validateEntryType(value: unknown): value is DiscussionEntryType {
  return typeof value === 'string' && (ALLOWED_ENTRY_TYPES as string[]).includes(value)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    if (!id.startsWith('sample-')) {
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { data, error } = await supabaseAdmin
      .from(TABLES.PAPER_DISCUSSIONS)
      .select(
        'id, paper_id, paper_lookup_id, paper_title, paper_authors, paper_url, user_id, entry_type, content, structured_payload, reply_to_id, author_display_name, created_at, updated_at'
      )
      .eq('paper_lookup_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to load paper discussions:', error)
      return NextResponse.json({ error: 'Unable to load discussions' }, { status: 500 })
    }

    const entries = Array.isArray(data) ? data.map(mapRowToPayload) : []

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('Unexpected error in paper discussions GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      entryType,
      content: rawContent,
      structuredPayload,
      replyToId,
      paperTitle,
      paperAuthors,
      paperUrl,
      authorDisplayName
    } = body as Record<string, unknown>

    if (!validateEntryType(entryType)) {
      return NextResponse.json({ error: 'Invalid entry type' }, { status: 400 })
    }

    const content = sanitizeContent(rawContent)

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: 'Content is too long' }, { status: 400 })
    }

    if (entryType === 'answer' && (!replyToId || typeof replyToId !== 'string')) {
      return NextResponse.json({ error: 'Answers must reference a parent entry' }, { status: 400 })
    }

    if ((entryType === 'share' || entryType === 'question') && replyToId) {
      return NextResponse.json({ error: 'Shares and questions cannot include reply_to_id' }, { status: 400 })
    }

    if (!paperTitle || typeof paperTitle !== 'string') {
      return NextResponse.json({ error: 'Paper title is required' }, { status: 400 })
    }

    const authorsArray = Array.isArray(paperAuthors)
      ? paperAuthors.filter((author): author is string => typeof author === 'string')
      : []

    const structuredData = structuredPayload && typeof structuredPayload === 'object'
      ? structuredPayload as Record<string, unknown>
      : {}

    let parentId: string | null = null
    if (entryType === 'answer') {
      parentId = replyToId as string
      const { data: parent, error: parentError } = await supabaseAdmin
        .from(TABLES.PAPER_DISCUSSIONS)
        .select('id, paper_lookup_id, entry_type')
        .eq('id', parentId)
        .maybeSingle()

      if (parentError || !parent) {
        return NextResponse.json({ error: 'Parent discussion not found' }, { status: 404 })
      }

      if (parent.paper_lookup_id !== id) {
        return NextResponse.json({ error: 'Reply must reference the same paper' }, { status: 400 })
      }

      if (parent.entry_type === 'answer') {
        return NextResponse.json({ error: 'Cannot reply to an answer yet' }, { status: 400 })
      }
    }

    const maybeUuid = isUuid(id) ? id : null

    const { data, error } = await supabaseAdmin
      .from(TABLES.PAPER_DISCUSSIONS)
      .insert({
        paper_id: maybeUuid,
        paper_lookup_id: id,
        paper_title: paperTitle,
        paper_authors: authorsArray,
        paper_url: typeof paperUrl === 'string' ? paperUrl : null,
        user_id: user.id,
        entry_type: entryType,
        content,
        structured_payload: structuredData,
        reply_to_id: parentId,
        author_display_name: typeof authorDisplayName === 'string' ? authorDisplayName.trim().slice(0, 120) || null : null
      })
      .select(
        'id, paper_id, paper_lookup_id, paper_title, paper_authors, paper_url, user_id, entry_type, content, structured_payload, reply_to_id, author_display_name, created_at, updated_at'
      )
      .single()

    if (error || !data) {
      console.error('Failed to create discussion entry:', error)
      return NextResponse.json({ error: 'Unable to create discussion entry' }, { status: 500 })
    }

    return NextResponse.json(mapRowToPayload(data), { status: 201 })
  } catch (error) {
    console.error('Unexpected error in paper discussions POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
