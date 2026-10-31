// app/api/admin/usage/route.ts — monthly usage for the admin Usage page (admin only). Reads usage_by_month() (sql/phase28).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '../../../../lib/admin-guard'
import { sbAdmin } from '../../../../lib/supabase/admin'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const g = await requireStaff(req, 'developments'); if ('error' in g) return g.error
  const months = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get('months')) || 12))
  const { data, error } = await sbAdmin.rpc('usage_by_month', { p_months: months })
  if (error) {
    const missing = /does not exist|schema cache|Could not find the function/i.test(error.message)
    return NextResponse.json({ error: missing ? 'Usage tracking is not available until sql/phase28_routing_suspend_usage.sql has been applied.' : 'Could not load usage.' }, { status: missing ? 503 : 500 })
  }
  const rows = (data ?? []).map((r: any) => ({ month: String(r.month).slice(0, 7), visitors: Number(r.visitors), page_views: Number(r.page_views), signed_in_users: Number(r.signed_in_users), new_signups: Number(r.new_signups), enquiries: Number(r.enquiries), routed_enquiries: Number(r.routed_enquiries) }))
  const { count: totalUsers } = await sbAdmin.from('usage_events').select('id', { count: 'exact', head: true })
  const first = await sbAdmin.from('usage_events').select('occurred_at').order('occurred_at', { ascending: true }).limit(1).maybeSingle()
  return NextResponse.json({ rows, countingSince: first.data?.occurred_at ?? null, totalEvents: totalUsers ?? 0 })
}