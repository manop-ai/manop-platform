// app/api/agreements/[id]/route.ts — one of the requester's own requests: read, edit, resubmit.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { requireRequester, conflictingDevelopments, opportunityOptions, rejectedDevelopments, ownedProjects, pickRequestFields, notifyAgreementRequest, DISCLOSURE_KEYS, initialDisclosureStatus, UUID_RE } from '../../../../lib/agreements-server'
import { proposalFor, readinessGaps, validateRequest, REQUESTER_EDITABLE, type RequestStatus } from '../../../../lib/commercial-terms'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })
  const g = await requireRequester(req); if ('error' in g) return g.error
  // As the caller: RLS returns the row only to its owner, and only requester-visible events.
  const { data: request, error } = await g.sb.from('agreement_requests').select('*').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!request) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  const [{ data: links }, { data: events }] = await Promise.all([
    g.sb.from('agreement_request_developments').select('project_id').eq('request_id', params.id),
    g.sb.from('agreement_request_events').select('id,event_type,from_status,to_status,message,created_at,actor_role').eq('request_id', params.id).order('created_at', { ascending: true }),
  ])
  const owned = await ownedProjects(g.sb, g.requester)
  const ids = (links ?? []).map(l => l.project_id)
  const gaps = readinessGaps({ ...request, project_ids: ids }, request.requester_role)
  return NextResponse.json({ request, project_ids: ids, developments: owned.filter(p => ids.includes(p.id)), events, gaps, proposal: proposalFor(request) })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const g = await requireRequester(req); if ('error' in g) return g.error
  const r = g.requester

  const { data: current } = await g.sb.from('agreement_requests').select('*').eq('id', params.id).maybeSingle()
  if (!current || current.requester_user_id !== r.userId) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (!REQUESTER_EDITABLE.includes(current.status as RequestStatus)) {
    return NextResponse.json({ error: 'This request can no longer be edited by you. Contact MANOP if something needs to change.' }, { status: 409 })
  }

  const submit = body.submit === true
  const f = pickRequestFields(body)
  const { data: links } = await g.sb.from('agreement_request_developments').select('project_id').eq('request_id', params.id)
  const currentIds = (links ?? []).map(l => l.project_id)
  const nextIds = f.project_ids ?? currentIds
  const merged = { ...current, ...f, project_ids: nextIds }
  const v = validateRequest(merged, r.role, submit ? 'submit' : 'draft')
  if (!v.ok) return NextResponse.json({ error: v.errors.join(' '), gaps: v.gaps }, { status: 400 })

  const owned = await ownedProjects(g.sb, r)
  const ownedIds = new Set(owned.map(p => p.id))
  if (nextIds.some(id => !ownedIds.has(id))) return NextResponse.json({ error: 'One or more selected developments are not associated with your account.' }, { status: 403 })

  if (submit) {
    const rej = await rejectedDevelopments(nextIds)
    if (rej.length) return NextResponse.json({ error: `${rej.join(', ')} was not approved by MANOP. Resubmit it before requesting an agreement.` }, { status: 409 })
    const clash = await conflictingDevelopments(nextIds, params.id)
    if (clash.length) return NextResponse.json({ error: `${clash.map(c => c.name).join(', ')} already ${clash.length === 1 ? 'has' : 'have'} an open agreement request. Open that request instead of starting another.` }, { status: 409 })
  }
  const { project_ids: _ignore, ...cols } = f
  const update: Record<string, unknown> = { ...cols, updated_at: new Date().toISOString() }
  if (f.counterparty_name !== undefined) update.counterparty_role = r.role === 'agency' ? 'developer' : (f.counterparty_name ? 'agency' : null)

  // Editing the disclosure invalidates any earlier MANOP review or counterparty confirmation of it.
  const changed = DISCLOSURE_KEYS.filter(k => k in f && JSON.stringify((f as Record<string, unknown>)[k]) !== JSON.stringify((current as Record<string, unknown>)[k]))
  if (changed.length) { update.disclosure_status = initialDisclosureStatus(r.role, merged); update.disclosure_reviewed_by = null; update.disclosure_reviewed_at = null }

  const wasReturned = current.status === 'information_required' || current.status === 'clarification_requested'
  if (submit) { update.status = 'submitted'; update.status_updated_at = update.updated_at; update.submitted_at = current.submitted_at ?? update.updated_at }

  const { data: saved, error } = await sbAdmin.from('agreement_requests').update(update).eq('id', params.id).eq('requester_user_id', r.userId).select().single()
  if (error) return NextResponse.json({ error: 'Could not save your changes. Please try again.' }, { status: 500 })

  if (f.project_ids) {
    await sbAdmin.from('agreement_request_developments').delete().eq('request_id', params.id)
    if (nextIds.length) await sbAdmin.from('agreement_request_developments').insert(nextIds.map(pid => ({ request_id: params.id, project_id: pid })))
  }
  await sbAdmin.from('agreement_request_events').insert({
    request_id: params.id, actor_user_id: r.userId, actor_role: 'requester', event_type: submit ? (wasReturned ? 'resubmitted' : 'submitted') : 'draft_saved',
    from_status: current.status, to_status: saved.status, visible_to_requester: true,
    message: submit ? (wasReturned ? 'Updated and resubmitted to MANOP.' : 'Request submitted to MANOP.') : 'Draft saved.',
    metadata: changed.length ? { disclosure_fields_changed: changed } : {},
  })

  let notification = null
  if (submit) notification = await notifyAgreementRequest(wasReturned ? 'resubmitted' : 'submitted', saved, owned.filter(p => nextIds.includes(p.id)).map(p => p.name), readinessGaps(merged, r.role))
  return NextResponse.json({ request: saved, gaps: v.gaps, notification, proposal: proposalFor(saved) })
}