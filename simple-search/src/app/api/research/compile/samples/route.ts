import { NextResponse } from 'next/server'
import { SAMPLE_SIMILAR_PAPERS } from '@/data/sample-similar-papers'

export async function GET() {
  return NextResponse.json({
    success: true,
    papers: SAMPLE_SIMILAR_PAPERS
  })
}
