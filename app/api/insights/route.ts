// app/api/insights/route.ts — FIXED v2
// Returns market insight sentences for a neighborhood
// GET /api/insights?slug=lekki-phase-1
//
// Priority:
// 1. Live data from market_transactions + properties (verified)
// 2. Pre-computed market_benchmarks table
// 3. Hardcoded REAL_BENCHMARKS fallback (Lekki Phase 1 only)
//
// As agencies contribute transaction data, hardcoded data becomes unreachable.

import { NextRequest, NextResponse } from 'next/server'
import { getLiveInsights, generateInsights } from '../../../lib/insights'
import { addCORSHeaders, handleCORSPreflight } from '../../../lib/cors'

async function getLiveNGNRate(): Promise<number> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const r = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
      signal: controller.signal,
    })
    const d = await r.json()
    return d?.rates?.NGN || 1570
  } catch {
    return 1570
  }
}

export async function OPTIONS() {
  return handleCORSPreflight()
}

export async function GET(req: NextRequest) {
  try {
    const slug    = req.nextUrl.searchParams.get('slug') || 'lekki-phase-1'
    const ngnRate = await getLiveNGNRate()

    // Try live DB data first — falls back to hardcoded automatically
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

    let insights = await getLiveInsights(slug, ngnRate, supabaseUrl, supabaseKey)

    // If getLiveInsights returned empty (no DB data, no hardcoded match),
    // try generating from hardcoded as absolute last resort
    if (!insights.length) {
      insights = generateInsights(slug, ngnRate)
    }

    const hasLiveData = insights.some(i => !i.is_fallback)

    const response = NextResponse.json({
      slug,
      ngn_rate:     ngnRate,
      count:        insights.length,
      insights,
      data_source:  hasLiveData ? 'live' : 'fallback',
      generated_at: new Date().toISOString(),
    }, {
      // Cache for 1 hour — live data refreshes on next cron run
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })

    return addCORSHeaders(response)
  } catch (err) {
    const response = NextResponse.json({ error: String(err) }, { status: 500 })
    return addCORSHeaders(response)
  }
}