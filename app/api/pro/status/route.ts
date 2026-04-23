// app/api/pro/status/route.ts
// GET /api/pro/status?email=user@example.com
// Returns tier and pro status for a given email
// Called by useProStatus hook on every page load (cached 1hr in client)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const PRO_TIERS = ['pro', 'agency', 'admin']

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')

  if (!email || !email.includes('@')) {
    return NextResponse.json({ is_pro: false, tier: 'free' })
  }

  try {
    const { data } = await sb
      .from('user_profiles')
      .select('tier, stripe_customer_id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (!data) {
      return NextResponse.json({ is_pro: false, tier: 'free', email })
    }

    // Also check active subscription (belt and suspenders)
    const { data: sub } = await sb
      .from('user_subscriptions')
      .select('status, current_period_end, plan')
      .eq('email', email.toLowerCase().trim())
      .in('status', ['active', 'trialing'])
      .gte('current_period_end', new Date().toISOString())
      .single()

    const isProByTier = PRO_TIERS.includes(data.tier)
    const isProBySub  = !!sub

    return NextResponse.json({
      is_pro:         isProByTier || isProBySub,
      tier:           data.tier,
      email,
      has_active_sub: isProBySub,
      sub_plan:       sub?.plan || null,
      sub_until:      sub?.current_period_end || null,
    }, {
      headers: {
        // Cache in browser for 5 minutes, CDN for 1 minute
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
      },
    })

  } catch (err) {
    console.error('Pro status check error:', err)
    return NextResponse.json({ is_pro: false, tier: 'free', email })
  }
}