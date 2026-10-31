// app/api/notify/agency-submission/route.ts
//
// Fired from the agency dashboard's "Submit a development" flow right
// after the developer_projects row is created. The DB write already
// succeeded by the time this is called — this route only ever sends an
// email, so a failure here must never surface as a submission failure
// to the agency (the client calls this with .catch(() => {}), same
// fire-and-forget pattern as the lead-notification routes).

import { NextRequest, NextResponse } from 'next/server'
import { sendAdminNotification, notificationHtml, escapeHtml } from '../../../../lib/email'
import { sbFromRequest } from '../../../../lib/supabase/route-client'

export async function POST(req: NextRequest) {
  try {
    // SECURITY FIX: this used to send MANOP-branded email to the admin inbox for any anonymous caller, with unescaped HTML.
    // It now needs a signed-in user and a project that user can actually see (RLS), and every value is escaped and length-capped.
    const sb = sbFromRequest(req)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Sign in required.' }, { status: 401 })
    const { agency_name, development_name, developer_name, neighborhood, city, project_id } = await req.json()
    const ok = typeof project_id === 'string' && /^[0-9a-f-]{36}$/i.test(project_id)
    const { data: own } = ok ? await sb.from('developer_projects').select('id').eq('id', project_id).maybeSingle() : { data: null }
    if (!own) return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 })
    const c = (v: unknown) => escapeHtml(String(v ?? '').slice(0, 200))

    await sendAdminNotification(
      `New agency submission — ${String(development_name ?? '').replace(/[\r\n]+/g, ' ').slice(0, 120)}`,
      notificationHtml('New development submitted for review', [
        ['Development', c(development_name)],
        ['Developer', c(developer_name)],
        ['Submitting agency', c(agency_name)],
        ['Neighborhood', c(neighborhood)],
        ['City', c(city)],
        ['Project ID', c(project_id)],
      ]),
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    // Non-critical — the submission itself already succeeded.
    return NextResponse.json({ success: false }, { status: 200 })
  }
}
