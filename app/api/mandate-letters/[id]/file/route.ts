// app/api/mandate-letters/[id]/file/route.ts — the ONLY way a mandate letter is opened.
//   admin   any letter (the open is recorded)           owner  the agency's own letters
//   public  only while an admin has recorded PUBLIC visibility on an accepted letter of a published development; decided from the CURRENT
//           database row on every request, so withdrawing visibility takes effect at once for new requests.
// Everyone else gets 404, so an id cannot be probed. A short-lived signed Cloudinary link is created only after the decision; the file is
// stored as authenticated delivery, so there is no permanent or guessable URL. Limitation: a link already issued stays valid until it
// expires (5 minutes for MANOP/owner, 60 seconds for public).
//   GET            JSON { url, expiresInSeconds }   (signed-in callers use authedFetch)
//   GET ?r=1       302 redirect, PUBLIC letters only

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { decideLetterAccess } from '../../../../../lib/mandate-letter'
import { cloudConfig, openUrlFor } from '../../../../../lib/mandate-letter-server'
import { logLetterEvent } from '../../../../../lib/mandate-letter-db'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => NextResponse.json({ error: 'Document not found.' }, { status: 404 })

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID.test(params.id)) return notFound()
    const sb = sbFromRequest(req)
    const { data: { user } } = await sb.auth.getUser()
    const { data: l } = await sbAdmin.from('agency_mandate_letters').select('id,agency_id,project_id,status,visibility,cloudinary_public_id').eq('id', params.id).maybeSingle()
    if (!l || !l.cloudinary_public_id) return notFound()

    let isAdmin = false, agencyId: string | null = null
    if (user) {
      const { data: a } = await sb.rpc('is_manop_admin'); isAdmin = a === true
      if (!isAdmin) { const { data: p } = await sb.from('data_partners').select('id').eq('auth_user_id', user.id).maybeSingle(); agencyId = p?.id ?? null }
    }
    let parentPublished = false
    if (l.project_id) { const { data: p } = await sbAdmin.from('developer_projects').select('publish_status').eq('id', l.project_id).maybeSingle(); parentPublished = p?.publish_status === 'published' }

    const d = decideLetterAccess(l as any, { isAdmin, agencyId }, { parentPublished })
    if (!d.allowed || !d.via) return notFound()
    const cfg = cloudConfig()
    if (!cfg) return NextResponse.json({ error: 'Document access is not configured (storage credentials are missing).' }, { status: 503 })

    if (req.nextUrl.searchParams.get('r') === '1') {
      if (d.via !== 'public') return NextResponse.json({ error: 'Use the in-app viewer for this document.' }, { status: 403 })
      return NextResponse.redirect(openUrlFor(cfg, l.cloudinary_public_id, 'public').url, 302)
    }
    const u = openUrlFor(cfg, l.cloudinary_public_id, d.via)
    if (d.via === 'admin') await logLetterEvent({ letter_id: l.id, agency_id: l.agency_id, event_type: 'opened_by_admin', actor_user_id: user!.id, actor_role: 'admin' })
    return NextResponse.json({ url: u.url, expiresInSeconds: u.expiresInSeconds, via: d.via })
  } catch (e) { console.error('GET mandate-letter file', e); return NextResponse.json({ error: 'Could not open the document.' }, { status: 500 }) }
}