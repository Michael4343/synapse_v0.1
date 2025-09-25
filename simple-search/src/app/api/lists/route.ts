import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user's lists with item counts
    const { data: lists, error } = await supabase
      .from('user_lists')
      .select(`
        id,
        name,
        created_at,
        list_items(count)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
    }

    // Transform the data to include item counts
    const listsWithCounts = lists?.map(list => {
      const rawItems = Array.isArray(list.list_items) ? list.list_items : []
      const aggregatedCount = rawItems.length > 0 && typeof rawItems[0]?.count === 'number'
        ? rawItems[0]?.count ?? 0
        : rawItems.length

      return {
        id: list.id,
        name: list.name,
        created_at: list.created_at,
        items_count: aggregatedCount
      }
    }) || []

    return NextResponse.json({ lists: listsWithCounts })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check if list with this name already exists for user
    const { data: existingList } = await supabase
      .from('user_lists')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', trimmedName)
      .single()

    if (existingList) {
      return NextResponse.json({ error: 'A list with this name already exists' }, { status: 400 })
    }

    // Create new list
    const { data: newList, error } = await supabase
      .from('user_lists')
      .insert({
        user_id: user.id,
        name: trimmedName
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    }

    return NextResponse.json({
      list: {
        id: newList.id,
        name: newList.name,
        created_at: newList.created_at,
        items_count: 0
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
