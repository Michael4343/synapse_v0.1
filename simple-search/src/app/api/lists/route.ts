import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const startTime = Date.now()
  console.log('📊 [PERF] Lists API started')

  try {
    const supabase = await createClient()

    // Get current user
    const authStart = Date.now()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log(`📊 [PERF] Auth check: ${Date.now() - authStart}ms`)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fast query - get lists first, counts separately to avoid RLS performance issues
    const listsStart = Date.now()
    const { data: lists, error } = await supabase
      .from('user_lists')
      .select('id, name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    console.log(`📊 [PERF] Lists query: ${Date.now() - listsStart}ms`)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
    }

    if (!lists || lists.length === 0) {
      console.log(`📊 [PERF] Total API time: ${Date.now() - startTime}ms (no lists)`)
      return NextResponse.json({ lists: [] })
    }

    // Get counts separately with optimized query
    const countsStart = Date.now()
    const listIds = lists.map(list => list.id)
    const { data: counts, error: countsError } = await supabase
      .from('list_items')
      .select('list_id')
      .in('list_id', listIds)
    console.log(`📊 [PERF] Counts query: ${Date.now() - countsStart}ms`)

    // Count items per list
    const countMap = new Map<number, number>()
    if (counts && !countsError) {
      counts.forEach(item => {
        const currentCount = countMap.get(item.list_id) || 0
        countMap.set(item.list_id, currentCount + 1)
      })
    }

    // Combine lists with counts
    const listsWithCounts = lists.map(list => ({
      id: list.id,
      name: list.name,
      created_at: list.created_at,
      items_count: countMap.get(list.id) || 0
    }))

    console.log(`📊 [PERF] Total API time: ${Date.now() - startTime}ms`)
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
