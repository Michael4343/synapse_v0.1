import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../../lib/supabase-server'

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

    // Verify the list belongs to the current user and get items
    const { data: listWithItems, error } = await supabase
      .from('user_lists')
      .select(`
        id,
        name,
        created_at,
        list_items(
          id,
          paper_data,
          created_at
        )
      `)
      .eq('id', listId)
      .eq('user_id', user.id)
      .single()

    if (error || !listWithItems) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    return NextResponse.json({
      list: {
        id: listWithItems.id,
        name: listWithItems.name,
        created_at: listWithItems.created_at,
        items: listWithItems.list_items || []
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
