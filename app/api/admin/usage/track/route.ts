// app/api/usage/track/route.ts — records one anonymous page view (see lib/usage.ts for what is and is not stored).
// Never fails loudly: the page must not care. Needs sql/phase28 (usage_events); without it, nothing is recorded and nothing breaks.
import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { VISITOR_ID_RE, countablePath, isBot, referrerHost, shouldRecord } from '../../../../../lib/usage'

export const dynamic = 'force-dynamic'
const done = () => new NextResponse(null, { status: 204 })

export async function POST(req: NextRequest) {
  try {
    if (isBot(req.headers.get('user-agent'))) return done()
    let b: any; try { b = await req.json() } catch { return done() }
    const path = countablePath(b?.path)
    if (!path || typeof b?.visitor_id !== 'string' || !VISITOR_ID_RE.test(b.visitor_id)) return done()

    let userId: string | null = null
    if (req.headers.get('authorization')) {
      const { data: { user } } = await sbFromRequest(req).auth.getUser()
      userId = user?.id ?? null
    }
    const since30 = new Date(Date.now() - 30_000).toISOString(), since60 = new Date(Date.now() - 60_000).toISOString()
    const [{ count: same }, { count: minute }] = await Promise.all([
      sbAdmin.from('usage_events').select('id', { count: 'exact', head: true }).eq('visitor_id', b.visitor_id).eq('path', path).gte('occurred_at', since30),
      sbAdmin.from('usage_events').select('id', { count: 'exact', head: true }).eq('visitor_id', b.visitor_id).gte('occurred_at', since60),
    ])
    if (!shouldRecord({ sameRecentView: (same ?? 0) > 0, viewsLastMinute: minute ?? 0 })) return done()
    await sbAdmin.from('usage_events').insert({ visitor_id: b.visitor_id, user_id: userId, path, referrer_host: referrerHost(b.referrer, req.headers.get('host')) })
  } catch { /* a counter must never break a page */ }
  return done()
}