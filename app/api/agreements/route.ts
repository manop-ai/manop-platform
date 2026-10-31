// app/api/agreements/route.ts — a requester's own agreement requests: list + create (draft or submit).
// A request is not an agreement and creates no binding terms. Agreement documents and completion: /api/agreements/[id]/documents.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../lib/supabase/admin'
import { requireRequester, conflictingDevelopments, opportunityOptions, rejectedDevelopments, ownedProjects, pickRequestFields, initialDisclosureStatus, notifyAgreementRequest, UUID_RE } from '../../../lib/agreements-server'
import { newReference, readinessGaps, validateRequest, PROPOSED_FEE_RATE_PCT, PROPOSED_SHARE_RATE_PCT } from '../../../lib/commercial-terms'

export async function GET(req: NextRequest) {
  const g = await requireRequester(req, req.nextUrl.searchParams.get('role')); if ('error' in g) return g.error
  // Reads run as the caller: RLS (owner select) is what limits this to their own requests.
  const { data, error } = await g.sb.from('agreement_requests')
    .select('id,reference,status,preferred_option,company_name,requester_role,submitted_at,status_updated_at,created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const projects = await opportunityOptions(g.requester)
  return NextResponse.json({ requests: data, role: g.requester.role, defaults: g.requester.defaults, projects })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const g = await requireRequester(req, typeof body.requester_role === 'string' ? body.requester_role : null); if ('error' in g) return g.error
  const r = g.requester

  const clientId = typeof body.client_request_id === 'string' ? body.client_request_id : ''
  if (!UUID_RE.test(clientId)) return NextResponse.json({ error: 'Missing request identifier. Reload the page and try again.' }, { status: 400 })

  // Idempotency: a repeated click / retry returns the request already saved instead of creating another.
  const existing = async () => (await sbAdmin.from('agreement_requests').select('*').eq('requester_user_id', r.userId).eq('client_request_id', clientId).maybeSingle()).data
  const dup = await existing()
  if (dup) return NextResponse.json({ request: dup, duplicate: true })

  const submit = body.submit === true
  const f = pickRequestFields(body)
  const v = validateRequest(f, r.role, submit ? 'submit' : 'draft')
  if (!v.ok) return NextResponse.json({ error: v.errors.join(' '), gaps: v.gaps }, { status: 400 })

  // Only developments the requester actually owns may be attached.
  const owned = await ownedProjects(g.sb, r)
  const ownedIds = new Set(owned.map(p => p.id))
  const projectIds = (f.project_ids ?? [])
  if (projectIds.some(id => !ownedIds.has(id))) return NextResponse.json({ error: 'One or more selected developments are not associated with your account.' }, { status: 403 })

  if (submit) {
    const rej = await rejectedDevelopments(projectIds)
    if (rej.length) return NextResponse.json({ error: `${rej.join(', ')} was not approved by MANOP. Resubmit it before requesting an agreement.` }, { status: 409 })
    const clash = await conflictingDevelopments(projectIds, null)
    if (clash.length) return NextResponse.json({ error: `${clash.map(c => c.name).join(', ')} already ${clash.length === 1 ? 'has' : 'have'} an open agreement request. Open that request instead of starting another.` }, { status: 409 })
  }
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    client_request_id: clientId, requester_user_id: r.userId, requester_role: r.role,
    agency_id: r.agencyId, developer_account_id: r.developerAccountId,
    company_name: f.company_name || r.defaults.company_name,
    requester_name: f.requester_name ?? null, requester_title: f.requester_title ?? null,
    contact_email: f.contact_email ?? null, contact_phone: f.contact_phone ?? null,
    counterparty_name: f.counterparty_name ?? null, counterparty_role: r.role === 'agency' ? 'developer' : (f.counterparty_name ? 'agency' : null),
    preferred_option: f.preferred_option ?? null, currency: f.currency ?? null, illustrative_transaction_value: f.illustrative_transaction_value ?? null,
    commission_type: f.commission_type ?? null, commission_rate_pct: f.commission_rate_pct ?? null, commission_fixed_amount: f.commission_fixed_amount ?? null,
    commission_basis: f.commission_basis ?? null, commission_pct_scope: f.commission_pct_scope ?? null, commission_payer: f.commission_payer ?? null,
    commission_shared: f.commission_shared ?? null, commission_shared_details: f.commission_shared_details ?? null, commission_retained_pct: f.commission_retained_pct ?? null,
    commission_varies: f.commission_varies ?? null, commission_notes: f.commission_notes ?? null, disclosure_declined: f.disclosure_declined === true,
    disclosure_status: initialDisclosureStatus(r.role, f),
    opportunity_kind: (f as any).opportunity_kind ?? (projectIds.length ? 'development' : 'agency_level'), scope_note: (f as any).scope_note ?? null,
    requester_notes: f.requester_notes ?? null, questions: f.questions ?? null,
    // The proposed rates are the platform's stated proposals, never something the requester sets.
    proposed_fee_rate_pct: PROPOSED_FEE_RATE_PCT, proposed_share_rate_pct: PROPOSED_SHARE_RATE_PCT,
    status: submit ? 'submitted' : 'draft', status_updated_at: now, submitted_at: submit ? now : null,
  }

  let created: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const { data, error } = await sbAdmin.from('agreement_requests').insert({ ...row, reference: newReference() }).select().single()
    if (!error) { created = data; break }
    if (error.code === '23505') {
      const again = await existing()                       // lost a double-click race: return the winner
      if (again) return NextResponse.json({ request: again, duplicate: true })
      continue                                             // reference collision: try another
    }
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }
  if (!created) return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })

  if (projectIds.length) await sbAdmin.from('agreement_request_developments').insert(projectIds.map(pid => ({ request_id: created!.id, project_id: pid })))
  await sbAdmin.from('agreement_request_events').insert([
    { request_id: created.id, actor_user_id: r.userId, actor_role: 'requester', event_type: submit ? 'submitted' : 'draft_saved', to_status: created.status, visible_to_requester: true, message: submit ? 'Request submitted to MANOP.' : 'Draft saved.' },
  ])

  let notification: { attempted: boolean; configured: boolean; missing: string[] } | null = null
  if (submit) notification = await notifyAgreementRequest('submitted', created, owned.filter(p => projectIds.includes(p.id)).map(p => p.name), readinessGaps(f, r.role))

  return NextResponse.json({ request: created, gaps: v.gaps, notification }, { status: 201 })
}