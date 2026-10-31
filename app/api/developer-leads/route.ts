// app/api/developer-leads/route.ts
//
// Enquiries from /development/[id] pages route here — NOT into `inquiries`,
// which is reserved for agency/resale listings. This is the INTRODUCTION
// REGISTER entry point: every accepted enquiry becomes one developer_leads row
// (stable reference: manop_lead_id), an `introduction_created` milestone, a
// lead_stage_log row (the audit trail behind the success-fee model) and an
// admin notification. Admin can still relay to an unclaimed developer
// manually — see relayed_to_developer_at.
//
// Server-side decisions (never trusted from the request body):
//   - who the buyer is: read from the Authorization header, not from `user_id`
//     in the body (a body field would let anyone attach an enquiry to someone
//     else's account);
//   - which developer receives it: taken from the published project itself;
//   - whether it is a duplicate: one open introduction per person per
//     development. A repeat enquiry from the same account, email or phone does
//     NOT create a second, competing record — it is logged against the existing
//     introduction and admin is told.

import { mandateOnFile } from '../../../lib/mandate-on-file'
import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin as sb } from '../../../lib/supabase/admin'
import { sbFromRequest } from '../../../lib/supabase/route-client'
import { sendAdminNotification, notificationHtml, escapeHtml } from '../../../lib/email'
import { isSamePerson, CLOSED_STAGES } from '../../../lib/deal-room'
import {
  validateUnitRequest, resolveRouting, PURPOSE_LABEL, FINANCING_TYPE_LABEL, ROUTING_LABEL, priceLine,
  type UnitRow, type UnitSnapshot, type RoutingStatus, type RequestPurpose, type FinancingTypeKey,
} from '../../../lib/unit-selection'

// notificationHtml() does not escape, and these rows carry text a visitor typed (name, note, contact).
const safeRows = (rows: Array<[string, string | null | undefined]>): Array<[string, string | null | undefined]> =>
  rows.map(([k, v]) => [k, v == null || v === '' ? v : escapeHtml(v)])

// A column that does not exist yet (sql/phase14_unit_request.sql not applied) must not lose a real buyer's request.
function isMissingColumn(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false
  return e.code === '42703' || e.code === 'PGRST204' || /column .*(does not exist|schema cache)|could not find the .* column/i.test(e.message ?? '')
}

function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      project_id,
      site_id,
      unit_type_id,
      request_purpose,
      financing_type,
      name,
      email,
      phone,
      country,
      is_diaspora = false,
      budget_usd,
      note,
      source = 'manop',
      neighborhood,
      city,
      country_code = 'NG',
      attribution_acknowledged = false,
    } = body

    // One intake for every source. A development enquiry carries project_id; a land / JV /
    // redevelopment / Site Intelligence introduction carries site_id; anything else is a
    // general enquiry to MANOP. The two ids are never combined.
    if (project_id && site_id) return cors(NextResponse.json({ error: 'Send either project_id or site_id, not both.' }, { status: 400 }))
    const source_kind: 'development' | 'site' | 'general' = project_id ? 'development' : site_id ? 'site' : 'general'
    if (!name?.trim()) return cors(NextResponse.json({ error: 'name required' }, { status: 400 }))
    // Consent is enforced here, not only in the form: MANOP records and routes every development or site enquiry, and shares the
    // enquirer's details with the partner in charge only after MANOP routes it. No consent, no enquiry.
    if (source_kind !== 'general' && attribution_acknowledged !== true) {
      return cors(NextResponse.json({ error: 'Please tick the consent box so MANOP can record your enquiry and share your details with the developer or partner in charge.' }, { status: 400 }))
    }
    if (!phone?.trim() && !email?.trim()) {
      return cors(NextResponse.json({ error: 'phone or email required' }, { status: 400 }))
    }
    if (source_kind === 'general' && !note?.trim()) {
      return cors(NextResponse.json({ error: 'Tell us what you would like to ask.' }, { status: 400 }))
    }

    // Only MANOP-reviewed (published) developments and sites can receive introductions, and the
    // receiving developer is whoever owns that opportunity — not what the form said.
    let developer_id: string | null = null
    let subject = 'General enquiry to MANOP'
    let routing: RoutingStatus | null = null
    let unitRows: UnitRow[] = []
    if (source_kind !== 'development' && (unit_type_id || request_purpose)) {
      return cors(NextResponse.json({ error: 'Unit selection applies to developments only.' }, { status: 400 }))
    }
    if (source_kind === 'development') {
      const { data: project } = await sb
        .from('developer_projects')
        .select('id, name, developer_id, publish_status, submitting_agency_id, mandate_document_url, mandate_letter_id')
        .eq('id', project_id)
        .maybeSingle()
      if (!project || project.publish_status !== 'published') {
        return cors(NextResponse.json({ error: 'That development is not available for enquiries.' }, { status: 404 }))
      }
      developer_id = project.developer_id
      subject = project.name

      // Where this is handled, from facts about the development (never from the request body).
      // A lookup failure leaves routing unrecorded rather than guessing a recipient.
      const routingFacts = { submittingAgencyId: project.submitting_agency_id ?? null, mandateOnFile: await mandateOnFile(project) }
      if (!developer_id) {
        routing = resolveRouting({ developerClaimed: false, ...routingFacts })
      } else {
        const { data: acct, error: acctErr } = await sb.from('developer_accounts').select('id, auth_user_id').eq('id', developer_id).maybeSingle()
        if (!acctErr) routing = resolveRouting({ developerClaimed: !!acct?.auth_user_id, ...routingFacts })
      }

      // The unit the buyer chose must be one of THIS development's own units. The price is read from
      // that unit's own record here; a price sent by the browser is never used.
      if (unit_type_id || request_purpose) {
        const { data: rows, error: unitErr } = await sb
          .from('developer_unit_types')
          .select('id,unit_type,price_ngn,price_usd,currency_code,size_sqm,available_count,deposit_pct,installment_months,last_price_verified_at')
          .eq('project_id', project_id)
        if (unitErr) return cors(NextResponse.json({ error: 'Unit details could not be checked right now. Please try again.' }, { status: 503 }))
        unitRows = (rows ?? []) as UnitRow[]
      }
    } else if (source_kind === 'site') {
      const { data: site } = await sb
        .from('sites')
        .select('id, developer_id, site_status, opportunity_type, neighborhood, city')
        .eq('id', site_id)
        .maybeSingle()
      if (!site || site.site_status !== 'published') {
        return cors(NextResponse.json({ error: 'That opportunity is not available for enquiries.' }, { status: 404 }))
      }
      developer_id = site.developer_id ?? null
      subject = `${site.opportunity_type ?? 'Site'} opportunity${site.neighborhood ? ` — ${site.neighborhood}` : ''}${site.city ? `, ${site.city}` : ''}`
    }
    const project = { name: subject }

    const unitCheck = validateUnitRequest({ units: unitRows, unitTypeId: unit_type_id || null, purpose: request_purpose || null, financingType: financing_type || null })
    if ('error' in unitCheck) return cors(NextResponse.json({ error: unitCheck.error }, { status: 400 }))
    const snapshot: UnitSnapshot | null = unitCheck.snapshot
    const purpose: RequestPurpose | null = unitCheck.purpose
    const finType: FinancingTypeKey | null = unitCheck.financingType
    const requestDetail: [string, string | null][] = [
      ['Unit', snapshot?.unit_type_label ?? null],
      ['Recorded price at request', unitCheck.unit ? priceLine(unitCheck.unit) : null],
      ['Price status', unitCheck.unit ? unitCheck.unit.priceNote : null],
      ['Availability', unitCheck.unit ? unitCheck.unit.availabilityNote : null],
      ['Request', purpose ? PURPOSE_LABEL[purpose] : null],
      ['Financing type', finType ? FINANCING_TYPE_LABEL[finType] : null],
      ['Routing', routing ? ROUTING_LABEL[routing] : null],
    ]

    // Who is asking — from the verified token, if there is one.
    let user_id: string | null = null
    if (req.headers.get('authorization')) {
      const { data: { user } } = await sbFromRequest(req).auth.getUser()
      user_id = user?.id ?? null
    }

    const cleanEmail = email?.trim().toLowerCase() || null
    const cleanPhone = phone?.trim() || null

    // ── Duplicate check: one open introduction per person per development ──
    // Scope: the same development, the same site, or the open general enquiries.
    // (site_id / source_kind exist only after sql/phase11_deal_room_operations.sql; they are
    // read and written only for non-development sources, so development enquiries work either way.)
    let existingQ = sb.from('developer_leads').select('id, manop_lead_id, user_id, email, phone, stage')
    existingQ = source_kind === 'development' ? existingQ.eq('project_id', project_id)
      : source_kind === 'site' ? existingQ.eq('site_id', site_id)
      : existingQ.is('project_id', null).is('site_id', null)
    const { data: existing, error: existingErr } = await existingQ
    // Never skip the duplicate check silently: a failure here must not become a second open lead.
    if (existingErr) return cors(NextResponse.json({ error: 'Enquiries of this kind are not available yet.' }, { status: 503 }))
    const duplicate = (existing || []).find(l =>
      !CLOSED_STAGES.includes(l.stage) &&
      isSamePerson({ user_id, email: cleanEmail, phone: cleanPhone }, { user_id: l.user_id, email: l.email, phone: l.phone }),
    )

    if (duplicate) {
      void (async () => {
        try {
          await sb.from('lead_milestones').insert({
            lead_id: duplicate.id,
            manop_lead_id: duplicate.manop_lead_id,
            milestone: 'repeat_enquiry_received',
            action: 'report',
            party_role: 'system',
            actor_user_id: user_id,
            // A repeat enquiry may be about a DIFFERENT unit; the unit and purpose are kept in the record.
            note: [
              snapshot ? `Repeat enquiry about ${snapshot.unit_type_label}${purpose ? ` (${PURPOSE_LABEL[purpose]})` : ''}; recorded price ${priceLine(unitCheck.unit!)}. ${unitCheck.unit!.priceNote}` : null,
              note?.trim() ? `Buyer note: ${String(note).trim().slice(0, 500)}` : null,
            ].filter(Boolean).join(' · ') || 'Repeat enquiry from the same contact; no new introduction created.',
          })
          // The first enquiry named no unit: record this one's unit on it. Never overwrites a recorded unit,
          // and a missing column (migration not applied) is simply ignored.
          if (snapshot) {
            await sb.from('developer_leads').update({
              unit_type_id: snapshot.unit_type_id, unit_type_label: snapshot.unit_type_label, unit_price_ngn: snapshot.unit_price_ngn,
              unit_price_usd: snapshot.unit_price_usd, unit_price_currency: snapshot.unit_price_currency, unit_price_status: snapshot.unit_price_status,
              unit_price_verified_at: snapshot.unit_price_verified_at, unit_available_count: snapshot.unit_available_count,
              unit_snapshot_at: snapshot.unit_snapshot_at, request_purpose: purpose, financing_type: finType,
            }).eq('id', duplicate.id).is('unit_type_label', null)
          }
          // A signed-in buyer repeating an earlier anonymous enquiry: link it to their account.
          if (user_id && !duplicate.user_id) {
            await sb.from('developer_leads').update({ user_id }).eq('id', duplicate.id)
          }
          await sendAdminNotification(
            `Repeat enquiry — ${name.trim()} (${duplicate.manop_lead_id ?? duplicate.id})`,
            notificationHtml('Repeat development enquiry (no new introduction created)', safeRows([
              ['Name', name.trim()], ['Email', cleanEmail], ['Phone', cleanPhone],
              ['Subject', project.name], ['Existing introduction', duplicate.manop_lead_id],
              ...requestDetail,
            ])),
          )
        } catch { /* non-critical */ }
      })()
      return cors(NextResponse.json({
        success: true, duplicate: true, lead_id: duplicate.id, manop_lead_id: duplicate.manop_lead_id,
      }))
    }

    const baseRow = {
      user_id,
      developer_id,
      project_id: project_id || null,
      ...(source_kind !== 'development' ? { source_kind, site_id: site_id || null } : {}),
      unit_type_id: snapshot?.unit_type_id ?? null,
      name:          name.trim(),
      email:         cleanEmail,
      phone:         cleanPhone,
      country:       country?.trim() || null,
      is_diaspora,
      budget_usd:    budget_usd || null,
      unit_interest: snapshot?.unit_type_label ?? null,   // a readable name, never an id
      note:          note?.trim() || null,
      source,
      stage:         'enquiry',
      attribution_acknowledged_at: attribution_acknowledged ? new Date().toISOString() : null,
    }
    // The structured snapshot (sql/phase14_unit_request.sql). If those columns are not there yet,
    // fall back to the same facts as readable text in `note`, so the operator still sees the unit.
    const structuredRow = {
      ...baseRow,
      ...(routing ? { routing_status: routing } : {}),
      // every development/site introduction is held until an admin routes it to the partner in charge (sql/phase28)
      ...(source_kind !== 'general' ? { manop_routing_required: true } : {}),
      ...(snapshot ? {
        unit_type_label: snapshot.unit_type_label, unit_price_ngn: snapshot.unit_price_ngn, unit_price_usd: snapshot.unit_price_usd,
        unit_price_currency: snapshot.unit_price_currency, unit_price_status: snapshot.unit_price_status,
        unit_price_verified_at: snapshot.unit_price_verified_at, unit_available_count: snapshot.unit_available_count,
        unit_snapshot_at: snapshot.unit_snapshot_at, request_purpose: purpose, financing_type: finType,
      } : {}),
    }
    let structured = true
    let { data, error } = await sb.from('developer_leads').insert(structuredRow).select('id, manop_lead_id').single()
    if (error && isMissingColumn(error)) {
      structured = false
      const readable = requestDetail.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ')
      ;({ data, error } = await sb.from('developer_leads')
        .insert({ ...baseRow, note: [readable ? `[Request] ${readable}` : null, note?.trim() || null].filter(Boolean).join(' · ') || null })
        .select('id, manop_lead_id').single())
    }

    if (error || !data) {
      return cors(NextResponse.json({ error: error?.message ?? 'Could not save the request.' }, { status: 500 }))
    }

    // Fire-and-forget: stage log + first milestone + activity log + admin email.
    // Never blocks the response — a slow or misconfigured email provider
    // must never be the reason a real buyer's enquiry fails to save.
    void (async () => {
      try {
        await sb.from('lead_stage_log').insert({
          lead_id:       data.id,
          manop_lead_id: data.manop_lead_id,
          from_stage:    null,
          to_stage:      'enquiry',
          changed_by:    'system',
        })
        await sb.from('lead_milestones').insert({
          lead_id: data.id,
          manop_lead_id: data.manop_lead_id,
          milestone: 'introduction_created',
          action: 'report',
          party_role: 'system',
          actor_user_id: user_id,
          event_date: new Date().toISOString().slice(0, 10),
        })
        await sb.from('activity_log').insert({
          event_type:      'enquiry_sent',
          signal_category: 'demand',
          signal_weight:   25,
          message:         `Development enquiry from ${name.trim()}`,
          neighborhood:    neighborhood || null,
          city:            city || null,
          country_code,
          metadata:        { developer_id, project_id: project_id || null, site_id: site_id || null, is_diaspora, source, kind: `${source_kind}_enquiry` },
        })
      } catch { /* non-critical — ignore */ }

      await sendAdminNotification(
        `New ${source_kind === 'development' ? 'development' : source_kind === 'site' ? 'opportunity' : 'general'} enquiry — ${name.trim()}`,
        notificationHtml('New development enquiry', safeRows([
          ['Name', name.trim()],
          ['Email', cleanEmail],
          ['Phone', cleanPhone],
          ['Country', country?.trim() || null],
          ['Subject', project.name],
          ['Neighborhood', neighborhood],
          ['City', city],
          ...requestDetail,
          ['Note', note?.trim() || null],
          ['MANOP Lead ID', data.manop_lead_id],
        ])),
      )
    })()

    return cors(NextResponse.json({
      success: true, lead_id: data.id, manop_lead_id: data.manop_lead_id,
      unit: snapshot?.unit_type_label ?? null, routing, structured,
    }))

  } catch (err: unknown) {
    return cors(NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    ))
  }
}