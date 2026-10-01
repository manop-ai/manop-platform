// app/api/notify/agency-submission/route.ts
//
// Fired from the agency dashboard's "Submit a development" flow right
// after the developer_projects row is created. The DB write already
// succeeded by the time this is called — this route only ever sends an
// email, so a failure here must never surface as a submission failure
// to the agency (the client calls this with .catch(() => {}), same
// fire-and-forget pattern as the lead-notification routes).

import { NextRequest, NextResponse } from 'next/server'
import { sendAdminNotification, notificationHtml } from '../../../../lib/email'

export async function POST(req: NextRequest) {
  try {
    const { agency_name, development_name, developer_name, neighborhood, city, project_id } = await req.json()

    await sendAdminNotification(
      `New agency submission — ${development_name}`,
      notificationHtml('New development submitted for review', [
        ['Development', development_name],
        ['Developer', developer_name],
        ['Submitting agency', agency_name],
        ['Neighborhood', neighborhood],
        ['City', city],
        ['Project ID', project_id],
      ]),
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    // Non-critical — the submission itself already succeeded.
    return NextResponse.json({ success: false }, { status: 200 })
  }
}