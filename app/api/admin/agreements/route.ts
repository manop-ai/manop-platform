// app/api/admin/agreements/route.ts — admin list of agreement requests. Runs as the admin (RLS is_manop_admin()).

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/admin-guard'
import { adminEmailConfig } from '../../../../lib/email'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { STATUSES } from '../../../../lib/commercial-terms'

export async function GET(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const status = req.nextUrl.searchParams.get('status')
  const cols = 'id,reference,status,requester_role,company_name,requester_name,contact_email,preferred_option,disclosure_status,submitted_at,status_updated_at,created_at'
  const run = async (c: string) => {
    let q = g.sb.from('agreement_requests').select(c).order('status_updated_at', { ascending: false }).limit(300)
    if (status && (STATUSES as readonly string[]).includes(status)) q = q.eq('status', status)
    return q
  }
  let { data, error } = await run(cols + ',opportunity_kind')
  if (error && /opportunity_kind/.test(error.message)) ({ data, error } = await run(cols))   // phase25 not applied yet
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // Which exact developments (by id) each request names, so the list shows them without opening every request.
  const ids = (data ?? []).map((r: any) => r.id)
  const { data: links } = ids.length ? await sbAdmin.from('agreement_request_developments').select('request_id,project_id').in('request_id', ids) : { data: [] }
  const pids = Array.from(new Set((links ?? []).map(l => l.project_id)))
  const { data: projs } = pids.length ? await sbAdmin.from('developer_projects').select('id,name').in('id', pids) : { data: [] }
  const name = new Map((projs ?? []).map(p => [p.id, p.name]))
  const rows = (data ?? []).map((r: any) => ({ ...r, developments: (links ?? []).filter(l => l.request_id === r.id).map(l => ({ id: l.project_id, name: name.get(l.project_id) ?? l.project_id })) }))
  // Lets the admin screen say plainly if request emails cannot be sent (names the missing variables only).
  return NextResponse.json({ requests: rows, email: adminEmailConfig() })
}