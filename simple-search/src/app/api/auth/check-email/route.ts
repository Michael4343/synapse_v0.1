import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase configuration for account check')
      return NextResponse.json(
        { error: 'Unable to verify account status right now.' },
        { status: 500 }
      )
    }

    const adminUrl = new URL('/auth/v1/admin/users', supabaseUrl)
    adminUrl.searchParams.set('email', normalizedEmail)

    const response = await fetch(adminUrl.toString(), {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    })

    if (response.status === 404) {
      return NextResponse.json({ exists: false })
    }

    if (!response.ok) {
      console.error('Failed to check account existence:', response.status, await response.text())
      return NextResponse.json(
        { error: 'Unable to verify account status right now.' },
        { status: 500 }
      )
    }

    const data = await response.json()

    const users = Array.isArray(data?.users)
      ? data.users
      : Array.isArray(data)
        ? data
        : data?.user
          ? [data.user]
          : []

    const exists = users.some((user: any) => user?.email?.toLowerCase() === normalizedEmail)

    return NextResponse.json({ exists })
  } catch (error) {
    console.error('Unexpected error checking account existence:', error)
    return NextResponse.json(
      { error: 'Unable to verify account status right now.' },
      { status: 500 }
    )
  }
}
