import { NextRequest, NextResponse } from 'next/server'

import { createDigestTraceId, getWeeklyDigest } from '@/lib/weekly-digest'
import { createClient } from '@/lib/supabase-server'

interface ApiLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

function createApiLogger(): ApiLogger {
  const log = (level: 'log' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    const payload = meta && Object.keys(meta).length > 0 ? meta : undefined
    console[level]('[digest-api]', message, payload)
  }

  return {
    info: (message, meta) => log('log', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const logger = createApiLogger()
  let traceId = createDigestTraceId('anon')

  logger.info('request_start', { traceId })

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      logger.warn('auth_error', { traceId, error: authError.message })
      return NextResponse.json(
        {
          error: 'Authentication error',
          details: authError.message,
          traceId,
        },
        { status: 401 }
      )
    }

    if (!user) {
      logger.warn('auth_missing', { traceId })
      return NextResponse.json(
        {
          error: 'Authentication required',
          traceId,
        },
        { status: 401 }
      )
    }

    traceId = createDigestTraceId(user.id)
    logger.info('user_authenticated', { traceId, userId: user.id })

    const digestResult = await getWeeklyDigest(user.id, traceId)

    if (!digestResult) {
      const duration = Date.now() - startedAt
      logger.error('digest_generation_failed', { traceId, duration })
      return NextResponse.json(
        {
          error: 'Unable to generate digest at this time',
          details: 'Digest generator returned null.',
          traceId,
        },
        { status: 500 }
      )
    }

    const duration = Date.now() - startedAt
    logger.info('request_complete', {
      traceId,
      duration,
      papers: digestResult.papersCount,
    })

    return NextResponse.json({
      success: true,
      traceId,
      digest: digestResult,
    })
  } catch (error) {
    const duration = Date.now() - startedAt
    logger.error('request_unhandled_error', {
      traceId,
      duration,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
        traceId,
      },
      { status: 500 }
    )
  }
}

