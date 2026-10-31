// app/api/me/buyer-packs/route.ts — the signed-in buyer's own Buyer Packs (issued or granted), newest first.
// Identity comes from the verified token. Names are read for exactly the developments this user holds a pack for.
import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { BUYER_PACK_FORMAT_VERSION } from '../../../../lib/commercial-terms'
import { isMissingTable } from '../../../../lib/agency-election-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sb = sbFromRequest(req)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in to see your Buyer Packs.' }, { status: 401 })
    const { data, error } = await sbAdmin.from('buyer_pack_access').select('id,project_id,status,basis,format_version,granted_at,requested_at,expires_at').eq('user_id', user.id).order('requested_at', { ascending: false }).limit(100)
    if (error) return isMissingTable(error) ? NextResponse.json({ packs: [] }) : NextResponse.json({ error: error.message }, { status: 500 })
    const ids = Array.from(new Set((data ?? []).map(r => r.project_id)))
    const { data: projects } = ids.length ? await sbAdmin.from('developer_projects').select('id,name,city,neighborhood,publish_status').in('id', ids) : { data: [] }
    const byId = new Map((projects ?? []).map((p: any) => [p.id, p]))
    return NextResponse.json({
      packs: (data ?? []).map(r => {
        const p: any = byId.get(r.project_id)
        return { ...r, development: p ? { id: p.id, name: p.name, city: p.city, neighborhood: p.neighborhood, available: p.publish_status === 'published' } : null, formatCurrent: r.format_version === BUYER_PACK_FORMAT_VERSION }
      }),
    })
  } catch (e: unknown) {
    console.error('GET /api/me/buyer-packs', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
