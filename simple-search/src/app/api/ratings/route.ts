import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

interface PaperRating {
  id: number
  user_id: string
  paper_semantic_scholar_id: string
  paper_title: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

interface CreateRatingRequest {
  paperSemanticScholarId: string
  paperTitle: string
  rating: number
  comment?: string
}

interface UpdateRatingRequest {
  rating: number
  comment?: string
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const paperId = searchParams.get('paperId')

    let query = supabase
      .from('paper_ratings')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    // Filter by specific paper if paperId is provided
    if (paperId) {
      query = query.eq('paper_semantic_scholar_id', paperId)
    }

    const { data: ratings, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
    }

    return NextResponse.json({ ratings: ratings || [] })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateRatingRequest = await request.json()
    const { paperSemanticScholarId, paperTitle, rating, comment } = body

    // Validate required fields
    if (!paperSemanticScholarId || !paperTitle || !rating) {
      return NextResponse.json({ error: 'Paper ID, title, and rating are required' }, { status: 400 })
    }

    // Validate rating range
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
    }

    // Check if rating already exists for this user and paper
    const { data: existingRating } = await supabase
      .from('paper_ratings')
      .select('id')
      .eq('user_id', user.id)
      .eq('paper_semantic_scholar_id', paperSemanticScholarId)
      .single()

    if (existingRating) {
      return NextResponse.json({ error: 'Rating already exists for this paper. Use PUT to update.' }, { status: 409 })
    }

    // Create new rating
    const { data: newRating, error } = await supabase
      .from('paper_ratings')
      .insert({
        user_id: user.id,
        paper_semantic_scholar_id: paperSemanticScholarId,
        paper_title: paperTitle.slice(0, 500), // Truncate title if too long
        rating,
        comment: comment?.trim() || null
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create rating' }, { status: 500 })
    }

    return NextResponse.json({ rating: newRating }, { status: 201 })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: UpdateRatingRequest & { paperSemanticScholarId: string } = await request.json()
    const { paperSemanticScholarId, rating, comment } = body

    // Validate required fields
    if (!paperSemanticScholarId || !rating) {
      return NextResponse.json({ error: 'Paper ID and rating are required' }, { status: 400 })
    }

    // Validate rating range
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
    }

    // Update existing rating
    const { data: updatedRating, error } = await supabase
      .from('paper_ratings')
      .update({
        rating,
        comment: comment?.trim() || null
      })
      .eq('user_id', user.id)
      .eq('paper_semantic_scholar_id', paperSemanticScholarId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Rating not found' }, { status: 404 })
      }
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 })
    }

    return NextResponse.json({ rating: updatedRating })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}