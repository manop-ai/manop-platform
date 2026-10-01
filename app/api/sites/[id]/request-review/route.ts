// app/api/sites/[id]/request-review/route.ts
//
// Upgrades a Quick Review site into a full submission — the site
// keeps all its data, just moves from `is_quick_review = true, draft`
// into the real pending_review queue MANOP staff work from. Only
// works on sites that are currently a quick review in draft status,
// so this can't be used to skip the normal submission flow.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyAdminOfSiteSubmission } from '../../../../../lib/notify-admin'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  const { data: site } = await sb.from('sites').select('id, is_quick_review, site_status, city, neighborhood, entry_source').eq('id', params.id).single()

  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  if (!site.is_quick_review || site.site_status !== 'draft') {
    return NextResponse.json({ error: 'This site is not an eligible Quick Review draft.' }, { status: 400 })
  }

  const { error } = await sb
    .from('sites')
    .update({ site_status: 'pending_review' })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdminOfSiteSubmission({
    siteId: site.id, city: site.city, neighborhood: site.neighborhood,
    entrySource: site.entry_source, isAgencySubmission: false,
  })

  return NextResponse.json({ ok: true })
}