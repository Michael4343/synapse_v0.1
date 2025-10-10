import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  console.log('🧪 Digest Test: Starting environment validation')

  try {
    // Check environment variables
    const geminiKey = process.env.GEMINI_API_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const envCheck = {
      GEMINI_API_KEY: geminiKey ? `Present (${geminiKey.slice(0, 8)}...)` : 'Missing',
      SUPABASE_URL: supabaseUrl ? 'Present' : 'Missing',
      SUPABASE_SERVICE_KEY: supabaseServiceKey ? 'Present' : 'Missing'
    }

    console.log('🔑 Digest Test: Environment variables:', envCheck)

    // Test Gemini API with a simple request
    if (geminiKey) {
      console.log('🤖 Digest Test: Testing Gemini API...')

      const testResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${geminiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          temperature: 0.3,
          messages: [
            {
              role: 'user',
              content: 'Respond with just "API test successful"'
            }
          ]
        })
      })

      const geminiWorking = testResponse.ok
      const geminiStatus = testResponse.status

      if (!geminiWorking) {
        const errorText = await testResponse.text()
        console.error('❌ Digest Test: Gemini API failed:', {
          status: geminiStatus,
          error: errorText?.slice(0, 200)
        })
      } else {
        console.log('✅ Digest Test: Gemini API working')
      }

      return NextResponse.json({
        success: true,
        environment: envCheck,
        geminiApi: {
          working: geminiWorking,
          status: geminiStatus
        },
        timestamp: new Date().toISOString()
      })
    }

    return NextResponse.json({
      success: false,
      error: 'GEMINI_API_KEY not configured',
      environment: envCheck,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Digest Test: Validation failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}