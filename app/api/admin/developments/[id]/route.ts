// app/api/admin/developments/[id]/route.ts — MANOP admin: suspend, reinstate or delete one development.
//   GET    { development, records }   status, suspension and what is attached (so the admin knows whether delete is allowed)
//   POST   { action:'suspend', reason }   take it off the public site now (publish_status -> 'draft', suspended_at set); enquiries are refused
//          { action:'reinstate' }         clear the suspension; it still has to be published again by an admin (and passes the agreement gate)
//          { action:'delete' }            permanent removal, ONLY when nothing depends on it (no enquiries, no agreement request, no mandate letter)
// Suspension keeps every record. Delete never removes enquiries, agreements or payments: if any exist it is refused and the admin suspends instead.
// Needs sql/phase28 for suspended_* columns.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '../../../../../lib/admin-guard'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { planSuspend, planReinstate, planDelete } from '../../../../../lib/development-admin'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .*(does not exist|schema cache)/i.test(e.message ?? ''))

async function load(id: string) {
  const { data: dev, error } = await sbAdmin.from('developer_projects').select('id,name,publish_status,suspended_at,suspended_reason,partner_submitted,submitting_agency_id').eq('id', id).maybeSingle()
  if (error) return { error }
  if (!dev) return { dev: null }
  const count = async (table: string, col = 'project_id') => {
    const { count: c, error: e } = await sbAdmin.from(table).select('id', { count: 'exact', head: true }).eq(col, id)
    return e ? (/does not exist|schema cache/i.test(e.message) ? 0 : null) : (c ?? 0)
  }
  const links = await sbAdmin.from('agreement_request_developments').select('request_id', { count: 'exact', head: true }).eq('project_id', id)
  const records = {
    enquiries: await count('developer_leads'),
    agreementRequests: links.error ? (/does not exist|schema cache/i.test(links.error.message) ? 0 : null) : (links.count ?? 0),
    mandateLetters: await count('agency_mandate_letters'),
  }
  return { dev, records }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireStaff(req, 'developments'); if ('error' in g) return g.error
  if (!UUID.test(params.id)) return bad('Not found.', 404)
  const r: any = await load(params.id)
  if (r.error) return missing(r.error) ? bad('Suspend is not available until sql/phase28_routing_suspend_usage.sql has been applied.', 503) : bad('Could not load this development.', 500)
  if (!r.dev) return bad('Development not found.', 404)
  return NextResponse.json({ development: r.dev, records: r.records })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireStaff(req, 'developments'); if ('error' in g) return g.error
  if (!UUID.test(params.id)) return bad('Not found.', 404)
  let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
  const r: any = await load(params.id)
  if (r.error) return missing(r.error) ? bad('Suspend is not available until sql/phase28_routing_suspend_usage.sql has been applied.', 503) : bad('Could not load this development.', 500)
  if (!r.dev) return bad('Development not found.', 404)
  const now = new Date().toISOString()

  if (b.action === 'suspend') {
    const p = planSuspend({ suspendedAt: r.dev.suspended_at, reason: b.reason }); if (!p.ok) return bad(p.error!, 409)
    const { error } = await sbAdmin.from('developer_projects').update({ suspended_at: now, suspended_reason: String(b.reason).trim().slice(0, 1000), suspended_by: g.user.id, ...(r.dev.publish_status === 'published' ? { publish_status: 'draft' } : {}) }).eq('id', params.id)
    if (error) return bad('Could not suspend it. ' + error.message, 500)
    return NextResponse.json({ ok: true, message: 'Suspended. It is no longer shown on the public site and new enquiries are refused. Every record is kept.' })
  }
  if (b.action === 'reinstate') {
    const p = planReinstate({ suspendedAt: r.dev.suspended_at }); if (!p.ok) return bad(p.error!, 409)
    const { error } = await sbAdmin.from('developer_projects').update({ suspended_at: null, suspended_reason: null, suspended_by: null }).eq('id', params.id)
    if (error) return bad('Could not reinstate it. ' + error.message, 500)
    return NextResponse.json({ ok: true, message: 'Reinstated as a draft. Publish it again from Review Submissions when you are ready.' })
  }
  if (b.action === 'delete') {
    const p = planDelete({ records: r.records, confirmName: b.confirm_name, name: r.dev.name }); if (!p.ok) return bad(p.error!, 409)
    const { error } = await sbAdmin.from('developer_projects').delete().eq('id', params.id)
    if (error) return bad(error.code === '23503' ? 'Something still depends on this development, so it cannot be deleted. Suspend it instead.' : 'Could not delete it. ' + error.message, error.code === '23503' ? 409 : 500)
    return NextResponse.json({ ok: true, deleted: true, message: 'Deleted.' })
  }
  return bad('Unknown action.')
}