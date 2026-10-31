// app/api/deal-room/route.ts
//
// The Deal Room for one introduction (a developer_leads row).
//
//   GET  ?lead_id=…  → the introduction, its milestone history and the caller's role
//   POST {lead_id, action, milestone, …} → record one milestone event
//
// Who the caller is on this introduction is decided by lib/deal-room-server.ts from
// database facts (ownership of the development/site, a mandate on file, the buyer's
// own user_id, is_manop_admin()) — never from the request body, and never from
// user_metadata, which users can edit. Writes to lead_milestones use the service
// role only after those checks pass; ordinary users have no INSERT policy.
//
// An acknowledgement records RECEIPT. It does not make the acknowledging party the
// payer of anything: the responsible party comes from an executed agreement or a
// recorded MANOP decision (see lib/deal-room-access.ts, /api/deal-room/responsible-party).

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../lib/supabase/admin'
import { loadAccess, visibleLead } from '../../../lib/deal-room-server'
import { sendAdminNotification, notificationHtml } from '../../../lib/email'
import {
  ACTIONS, MILESTONES, MILESTONE_LABEL, ACTIVE_COMMERCIAL_TERMS_VERSION,
  validateAction, type Action, type Milestone, type MilestoneRow,
} from '../../../lib/deal-room'

async function loadRows(leadId: string): Promise<MilestoneRow[]> {
  const { data } = await sbAdmin.from('lead_milestones')
    .select('id, lead_id, milestone, action, party_role, actor_user_id, event_date, evidence_ref, note, target_id, created_at')
    .eq('lead_id', leadId).order('created_at', { ascending: true })
  return (data || []) as MilestoneRow[]
}

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const r = await loadAccess(req, leadId)
  if (!('access' in r)) return NextResponse.json({ error: r.error }, { status: r.status })
  const { access } = r

  let rows = await loadRows(leadId)
  if (access.party !== 'admin') {
    // MANOP's internal decisions are not part of what the parties see, and other users' ids are not exposed.
    rows = rows.filter(m => m.milestone !== 'responsible_party_recorded')
      .map(m => ({ ...m, actor_user_id: m.actor_user_id === access.userId ? m.actor_user_id : null }))
  }

  return NextResponse.json({
    party: access.party,
    lead: visibleLead(access.party, access.lead),
    milestones: rows,
    termsVersion: ACTIVE_COMMERCIAL_TERMS_VERSION,
  })
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return bad('Invalid request.') }

  const leadId: string = body?.lead_id
  const action: Action = body?.action
  const milestone: Milestone = body?.milestone
  if (!leadId || !ACTIONS.includes(action) || !MILESTONES.includes(milestone)) return bad('lead_id, a valid action and a valid milestone are required.')

  const eventDate: string | null = body.event_date || null
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return bad('event_date must be YYYY-MM-DD.')
  const evidenceRef: string | null = body.evidence_ref ? String(body.evidence_ref).trim().slice(0, 500) : null
  const note: string | null = body.note ? String(body.note).trim().slice(0, 2000) : null
  const targetId: string | null = body.target_id || null
  if (action === 'evidence' && !evidenceRef) return bad('Describe the evidence (a document name, reference or link).')
  if (action === 'dispute' && !note) return bad('Say what you are disputing so the other party and MANOP can respond.')

  const r = await loadAccess(req, leadId)
  if (!('access' in r)) return bad(r.error, r.status)
  const { access } = r

  const rows = await loadRows(leadId)

  const problem = validateAction({ party: access.party, actorUserId: access.userId, action, milestone, targetId }, rows)
  if (problem) return bad(problem, 422)

  const isAcknowledge = action === 'report' && milestone === 'introduction_acknowledged'
  if (isAcknowledge && (access.lead.acknowledged_at || rows.some(r => r.milestone === 'introduction_acknowledged' && r.action === 'report'))) {
    return bad('This introduction has already been acknowledged.', 409)
  }

  const { data: inserted, error: insErr } = await sbAdmin.from('lead_milestones').insert({
    lead_id: leadId,
    manop_lead_id: access.lead.manop_lead_id ?? null,
    milestone, action,
    party_role: access.party,
    actor_user_id: access.userId,
    event_date: eventDate, evidence_ref: evidenceRef, note, target_id: targetId,
  }).select().single()
  if (insErr) return bad(insErr.message, 500)

  if (isAcknowledge) {
    const terms = ACTIVE_COMMERCIAL_TERMS_VERSION
    const now = new Date().toISOString()
    await sbAdmin.from('developer_leads').update({
      acknowledged_at: now,
      acknowledged_by_user_id: access.userId,
      acknowledged_by_role: access.party, // developer | agency | landowner (receipt only)
      // Terms are recorded only when real terms are active — never invented.
      ...(terms ? { terms_version: terms, terms_accepted_at: now } : {}),
      updated_at: now,
    }).eq('id', leadId)
  }

  // Tell MANOP about the events that need a human: disputes and the qualifying milestones.
  const notify = action === 'dispute' || (action === 'report' && ['agreement_executed', 'qualifying_payment_reported'].includes(milestone))
  if (notify) {
    void sendAdminNotification(
      `Deal Room: ${action === 'dispute' ? 'dispute raised' : MILESTONE_LABEL[milestone]} — ${access.lead.manop_lead_id ?? leadId}`,
      notificationHtml('Deal Room event', [
        ['Introduction', access.lead.manop_lead_id ?? leadId],
        ['Milestone', MILESTONE_LABEL[milestone]],
        ['Action', action],
        ['By', access.party],
        ['Event date', eventDate],
        ['Note', note],
      ]),
    ).catch(() => { /* never fail the request over an email */ })
  }

  return NextResponse.json({ success: true, milestone: inserted })
}