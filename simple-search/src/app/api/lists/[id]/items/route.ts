import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const listId = parseInt(id)
    if (isNaN(listId)) {
      return NextResponse.json({ error: 'Invalid list ID' }, { status: 400 })
    }

    const body = await request.json()
    const { paper } = body

    if (!paper || !paper.id) {
      return NextResponse.json({ error: 'Paper data is required' }, { status: 400 })
    }

    // Verify the list belongs to the current user
    const { data: list, error: listError } = await supabase
      .from('user_lists')
      .select('id')
      .eq('id', listId)
      .eq('user_id', user.id)
      .single()

    if (listError || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Check if paper is already in the list
    const { data: existingItem } = await supabase
      .from('list_items')
      .select('id')
      .eq('list_id', listId)
      .eq('paper_data->id', paper.id)
      .single()

    if (existingItem) {
      return NextResponse.json({ error: 'Paper is already in this list' }, { status: 400 })
    }

    // Add paper to list
    const { data: newItem, error } = await supabase
      .from('list_items')
      .insert({
        list_id: listId,
        paper_data: paper
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to save paper to list' }, { status: 500 })
    }

    return NextResponse.json({
      item: {
        id: newItem.id,
        paper_data: newItem.paper_data,
        created_at: newItem.created_at
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  console.log('📊 [PERF] List Items API started')

  try {
    const supabase = await createClient()

    // Get current user
    const authStart = Date.now()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log(`📊 [PERF] Auth check: ${Date.now() - authStart}ms`)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const listId = parseInt(id)
    if (isNaN(listId)) {
      return NextResponse.json({ error: 'Invalid list ID' }, { status: 400 })
    }

    // Fast approach: verify ownership first, then get items separately
    // This avoids the RLS subquery performance issue

    // 1. Verify list exists and belongs to user
    const listCheckStart = Date.now()
    const { data: listInfo, error: listError } = await supabase
      .from('user_lists')
      .select('id, name, created_at')
      .eq('id', listId)
      .eq('user_id', user.id)
      .single()
    console.log(`📊 [PERF] List ownership check: ${Date.now() - listCheckStart}ms`)

    if (listError || !listInfo) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // 2. Get list items separately (much faster with fixed RLS policies)
    const itemsStart = Date.now()
    const { data: items, error: itemsError } = await supabase
      .from('list_items')
      .select('id, paper_data, created_at')
      .eq('list_id', listId)
      .order('created_at', { ascending: false })
    console.log(`📊 [PERF] Items query: ${Date.now() - itemsStart}ms`)

    // Return list info with items (empty array if items query failed)
    console.log(`📊 [PERF] Total API time: ${Date.now() - startTime}ms`)
    return NextResponse.json({
      list: {
        id: listInfo.id,
        name: listInfo.name,
        created_at: listInfo.created_at,
        items: items || []
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
