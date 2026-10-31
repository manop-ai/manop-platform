// app/api/deal-room/stage/route.ts
//
// The ONLY supported way to change an introduction's stage. Stage used to be
// written straight from the developer dashboard under the leads_owner_update
// RLS policy, which cannot limit WHICH columns an owner changes. The database
// trigger in sql/phase11_deal_room_operations.sql now blocks that path; this
// route authorises the change from database facts, applies the stage rules in
// lib/deal-room.ts and writes the audit row.
//
// A stage change never charges a fee, proves a payment or records an agreement
// as executed.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { loadAccess } from '../../../../lib/deal-room-server'
import { deriveStates, validateStageChange, type MilestoneRow } from '../../../../lib/deal-room'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return bad('Invalid request.') }
  const leadId = body?.lead_id, to = body?.to_stage
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : null
  if (typeof leadId !== 'string' || typeof to !== 'string') return bad('lead_id and to_stage are required.')

  const r = await loadAccess(req, leadId)
  if (!('access' in r)) return bad(r.error, r.status)
  const { access } = r

  const { data: rows } = await sbAdmin.from('lead_milestones')
    .select('id, lead_id, milestone, action, party_role, actor_user_id, event_date, evidence_ref, note, target_id, created_at')
    .eq('lead_id', leadId)
  const problem = validateStageChange({
    party: access.party, from: access.lead.stage, to,
    states: deriveStates((rows || []) as MilestoneRow[]), note,
  })
  if (problem) return bad(problem, 422)

  const from = access.lead.stage as string
  const now = new Date().toISOString()
  // Compare-and-set on the previous stage so two simultaneous changes cannot both win.
  const { data: updated, error } = await sbAdmin.from('developer_leads')
    .update({ stage: to, updated_at: now }).eq('id', leadId).eq('stage', from).select('id').maybeSingle()
  if (error) return bad(error.message, 500)
  if (!updated) return bad('The stage changed while you were working. Refresh and try again.', 409)

  await sbAdmin.from('lead_stage_log').insert({
    lead_id: leadId, manop_lead_id: access.lead.manop_lead_id ?? null,
    from_stage: from, to_stage: to, changed_by: access.party,
  })
  return NextResponse.json({ success: true, stage: to })
}