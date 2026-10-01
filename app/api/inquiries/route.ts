// app/api/inquiries/route.ts
//
// BUILD FIX: Supabase PostgrestFilterBuilder does not have .catch().
// The activity_log insert must use a standard try/catch or be fire-and-forget
// via a separate Promise chain, not chained directly on the Supabase builder.

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
      property_id,
      agency_id,
      buyer_name,
      buyer_email,
      message,
      inquiry_type = 'general',
    } = body

    if (!buyer_name?.trim()) {
      return cors(NextResponse.json({ error: 'buyer_name required' }, { status: 400 }))
    }
    if (!message?.trim()) {
      return cors(NextResponse.json({ error: 'message required' }, { status: 400 }))
    }

    let resolvedAgencyId = agency_id || null
    if (!resolvedAgencyId && property_id) {
      const { data: prop } = await sb
        .from('properties')
        .select('data_partner_id')
        .eq('id', property_id)
        .maybeSingle()
      resolvedAgencyId = prop?.data_partner_id || null
    }

    const { data, error } = await sb
      .from('inquiries')
      .insert({
        property_id:   property_id || null,
        agency_id:     resolvedAgencyId,
        buyer_name:    buyer_name.trim(),
        buyer_email:   buyer_email?.trim().toLowerCase() || null,
        message:       message.trim(),
        inquiry_type,
        status:        'new',
        created_at:    new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      return cors(NextResponse.json({ error: error.message }, { status: 500 }))
    }

    void (async () => {
      try {
        await sb.from('activity_log').insert({
          event_type:  'inquiry_sent',
          message:     `Inquiry from ${buyer_name.trim()}`,
          property_id: property_id || null,
          partner_id:  resolvedAgencyId || null,
          metadata:    { inquiry_type, has_email: !!buyer_email },
        })
      } catch { /* non-critical — ignore */ }

      await sendAdminNotification(
        `New inquiry — ${buyer_name.trim()}`,
        notificationHtml('New inquiry', [
          ['Name', buyer_name.trim()],
          ['Email', buyer_email?.trim() || null],
          ['Type', inquiry_type],
          ['Property', property_id],
          ['Agency', resolvedAgencyId],
          ['Message', message.trim()],
        ]),
      )
    })()

    return cors(NextResponse.json({ success: true, inquiry_id: data.id }))

  } catch (err: unknown) {
    return cors(NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    ))
  }
}

export async function GET(req: NextRequest) {
  const agencyId = req.nextUrl.searchParams.get('agency_id')
  if (!agencyId) {
    return cors(NextResponse.json({ error: 'agency_id required' }, { status: 400 }))
  }

  // SECURITY FIX: this endpoint previously returned any agency's buyer
  // inquiries (names, emails, messages) to anyone who knew or guessed
  // an agency_id — no authentication was performed at all. Nothing in
  // the app currently calls this route (grep confirms it's unused —
  // only POST is wired up in InquiryModal.tsx), so requiring auth here
  // cannot break an existing caller; it just closes an open PII leak
  // before anything starts depending on it.
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) {
    return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  const { data: partner } = await sb
    .from('data_partners')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .eq('id', agencyId)
    .maybeSingle()

  if (!partner) {
    return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
  }

  const { data, error } = await sb
    .from('inquiries')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })

  if (error) {
    return cors(NextResponse.json({ error: error.message }, { status: 500 }))
  }

  return cors(NextResponse.json({ inquiries: data || [] }))
}