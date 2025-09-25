import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paperId } = await params

    if (!paperId) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    // Fetch rating for this specific paper by current user
    const { data: rating, error } = await supabase
      .from('paper_ratings')
      .select('*')
      .eq('user_id', user.id)
      .eq('paper_semantic_scholar_id', paperId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rating found - this is expected, return null
        return NextResponse.json({ rating: null })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch rating' }, { status: 500 })
    }

    return NextResponse.json({ rating })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paperId } = await params

    if (!paperId) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    // Delete rating for this specific paper by current user
    const { error } = await supabase
      .from('paper_ratings')
      .delete()
      .eq('user_id', user.id)
      .eq('paper_semantic_scholar_id', paperId)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to delete rating' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}