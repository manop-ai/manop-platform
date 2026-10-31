// app/api/deal-room/responsible-party/route.ts
//
// Records which party is responsible to MANOP for an introduction. ADMIN ONLY.
//
// Responsibility is not something a party can claim by acknowledging a lead.
// The normal source is an executed agreement (Commercial/Documents workstream);
// until the two workstreams share that link, an admin may record a decision with
// a reason, which is written to the milestone log as an auditable MANOP entry.
// Never overwrites a different existing value.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { loadAccess } from '../../../../lib/deal-room-server'
import { validateAdminResponsibility, type PayerParty } from '../../../../lib/deal-room-access'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return bad('Invalid request.') }
  if (typeof body?.lead_id !== 'string') return bad('lead_id is required.')

  const r = await loadAccess(req, body.lead_id)
  if (!('access' in r)) return bad(r.error, r.status)
  const { access } = r
  if (access.party !== 'admin') return bad('Only MANOP admin can record the responsible party.', 403)

  const problem = validateAdminResponsibility(body.party, body.reason, (access.lead.responsible_party as PayerParty | null) ?? null)
  if (problem) return bad(problem, 422)

  const { error } = await sbAdmin.from('developer_leads')
    .update({ responsible_party: body.party, updated_at: new Date().toISOString() }).eq('id', body.lead_id)
  if (error) return bad(error.message, 500)

  await sbAdmin.from('lead_milestones').insert({
    lead_id: body.lead_id, manop_lead_id: access.lead.manop_lead_id ?? null,
    milestone: 'responsible_party_recorded', action: 'report', party_role: 'admin',
    actor_user_id: access.userId, note: `Responsible party recorded as ${body.party}. Reason: ${String(body.reason).trim().slice(0, 1500)}`,
  })
  return NextResponse.json({ success: true })
}