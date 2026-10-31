// app/api/deal-room/refer/route.ts   (the path keeps its earlier name; in the product this is "Route to developer / partner")
//
// ADMIN ONLY. MANOP sends a held introduction to the developer, agency or landowner in charge of the opportunity.
// Every new development/site introduction is held until this happens (lib/deal-room-access.ts heldByManop). Routing makes the
// enquirer's details visible to that party; the party then acknowledges (approves) the introduction in the Deal Room and starts dealing
// with the client. It requires the enquirer's consent on record. It creates no agreement, no fee and no milestone.
//
// Needs sql/phase15_referral.sql or sql/phase28 (referred_to_developer_at, referred_by_user_id).

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { loadAccess } from '../../../../lib/deal-room-server'
import { validateRouting, routeRecipient } from '../../../../lib/deal-room-access'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return bad('Invalid request.') }
  if (typeof body?.lead_id !== 'string') return bad('lead_id is required.')

  const r = await loadAccess(req, body.lead_id)
  if (!('access' in r)) return bad(r.error, r.status)
  const { access } = r

  let developerClaimed = false
  const devId = access.opportunity.developer_id ?? access.lead.developer_id
  if (devId) {
    const { data: acct } = await sbAdmin.from('developer_accounts').select('auth_user_id').eq('id', devId).maybeSingle()
    developerClaimed = !!acct?.auth_user_id
  }
  const recipient = routeRecipient({ developerClaimed, opp: { ...access.opportunity, developer_id: devId ?? null } })
  const problem = validateRouting({ party: access.party, lead: access.lead as any, recipient })
  if (problem) return bad(problem, access.party === 'admin' ? 409 : 403)

  const now = new Date().toISOString()
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null
  const { data: upd, error } = await sbAdmin.from('developer_leads')
    .update({ referred_to_developer_at: now, referred_by_user_id: access.userId, updated_at: now, ...(note ? { routing_note: note } : {}) })
    .eq('id', body.lead_id).is('referred_to_developer_at', null).select('id').maybeSingle()
  if (error) {
    const missing = error.code === '42703' || error.code === 'PGRST204' || /column .*(does not exist|schema cache)/i.test(error.message)
    return bad(missing ? 'Routing is not available until sql/phase28_routing_suspend_usage.sql has been applied.' : error.message, missing ? 503 : 500)
  }
  if (!upd) return bad('This introduction was routed while you were working. Refresh.', 409)
  try {
    await sbAdmin.from('lead_stage_log').insert({ lead_id: body.lead_id, manop_lead_id: access.lead.manop_lead_id ?? null, from_stage: access.lead.stage ?? null, to_stage: access.lead.stage ?? 'enquiry', changed_by: `admin_routed_to_${recipient}` })
  } catch { /* the lead row already records who routed it and when */ }
  return NextResponse.json({ ok: true, routed_to: recipient, referred_to_developer_at: now })
}