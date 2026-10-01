// app/api/developer-leads/route.ts
//
// Enquiries from /development/[id] pages route here — NOT into `inquiries`,
// which is reserved for agency/resale listings. Every insert also writes a
// row to lead_stage_log (the audit trail behind the success-fee model) and
// is left for admin to relay to the developer manually while that developer
// account is still unclaimed — see relayed_to_developer_at.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin as sb } from '../../../lib/supabase/admin'
import { sendAdminNotification, notificationHtml } from '../../../lib/email'

function cors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      developer_id,
      project_id,
      unit_type_id,
      name,
      email,
      phone,
      country,
      is_diaspora = false,
      budget_usd,
      unit_interest,
      note,
      source = 'manop',
      neighborhood,
      city,
      country_code = 'NG',
    } = body

    if (!developer_id) return cors(NextResponse.json({ error: 'developer_id required' }, { status: 400 }))
    if (!project_id)   return cors(NextResponse.json({ error: 'project_id required' }, { status: 400 }))
    if (!name?.trim()) return cors(NextResponse.json({ error: 'name required' }, { status: 400 }))
    if (!phone?.trim() && !email?.trim()) {
      return cors(NextResponse.json({ error: 'phone or email required' }, { status: 400 }))
    }

    const { data, error } = await sb
      .from('developer_leads')
      .insert({
        developer_id,
        project_id,
        unit_type_id: unit_type_id || null,
        name:          name.trim(),
        email:         email?.trim().toLowerCase() || null,
        phone:         phone?.trim() || null,
        country:       country?.trim() || null,
        is_diaspora,
        budget_usd:    budget_usd || null,
        unit_interest: unit_interest || null,
        note:          note?.trim() || null,
        source,
        stage:         'enquiry',
      })
      .select('id, manop_lead_id')
      .single()

    if (error) {
      return cors(NextResponse.json({ error: error.message }, { status: 500 }))
    }

    // Fire-and-forget: stage log entry + activity log + admin email.
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
        await sb.from('activity_log').insert({
          event_type:      'enquiry_sent',
          signal_category: 'demand',
          signal_weight:   25,
          message:         `Development enquiry from ${name.trim()}`,
          neighborhood:    neighborhood || null,
          city:            city || null,
          country_code,
          metadata:        { developer_id, project_id, is_diaspora, source, kind: 'development_enquiry' },
        })
      } catch { /* non-critical — ignore */ }

      await sendAdminNotification(
        `New development enquiry — ${name.trim()}`,
        notificationHtml('New development enquiry', [
          ['Name', name.trim()],
          ['Email', email?.trim() || null],
          ['Phone', phone?.trim() || null],
          ['Country', country?.trim() || null],
          ['Development', project_id],
          ['Neighborhood', neighborhood],
          ['City', city],
          ['Note', note?.trim() || null],
          ['MANOP Lead ID', data.manop_lead_id],
        ]),
      )
    })()

    return cors(NextResponse.json({ success: true, lead_id: data.id, manop_lead_id: data.manop_lead_id }))

  } catch (err: unknown) {
    return cors(NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    ))
  }
}