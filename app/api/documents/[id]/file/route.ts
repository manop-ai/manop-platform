// app/api/documents/[id]/file/route.ts
//
// The ONLY sanctioned way to open a stored document. Returns where the file can be fetched, after checking the caller:
//   admin  -> any document
//   owner  -> documents of their own developments/sites (the agency or developer that submitted them)
//   public -> only documents an admin explicitly made public, on a PUBLISHED development/site, never confidential ones
// Anyone else gets 404 (the existence of a private document is not revealed).
//
// Storage honesty: if the file is stored as a public Cloudinary link (the legacy "upload" delivery type), the link itself
// remains retrievable by anyone who has it; this route cannot change that. For files stored with authenticated delivery
// and CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET configured, it returns a short-lived signed URL instead.
//
// Browsers cannot attach the session to a plain link, so signed-in callers use authedFetch and open the returned url;
// public documents may also be opened directly with ?r=1 (302 redirect).

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { decideAccess, hasPublicLink, parseCloudinaryUrl, privateDownloadUrl } from '../../../../../lib/documents-access'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => NextResponse.json({ error: 'Document not found.' }, { status: 404 })

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return notFound()
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()                    // anonymous callers are allowed through to the public rule

  const { data: doc } = await sbAdmin.from('developer_documents')
    .select('id,document_url,document_type,document_name,publicly_visible,project_id,site_id,developer_id').eq('id', params.id).maybeSingle()
  if (!doc || !doc.document_url) return notFound()

  let isAdmin = false, isOwner = false, parentPublished = false
  if (user) {
    const { data: a } = await sb.rpc('is_manop_admin'); isAdmin = a === true
    if (!isAdmin) {
      const [{ data: partner }, { data: dev }] = await Promise.all([
        sb.from('data_partners').select('id').eq('auth_user_id', user.id).maybeSingle(),
        sb.from('developer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle(),
      ])
      if (dev && doc.developer_id === dev.id) isOwner = true
      if (doc.project_id) {
        const { data: p } = await sbAdmin.from('developer_projects').select('developer_id,submitting_agency_id,publish_status').eq('id', doc.project_id).maybeSingle()
        if (p) {
          parentPublished = p.publish_status === 'published'
          if ((partner && p.submitting_agency_id === partner.id) || (dev && p.developer_id === dev.id)) isOwner = true
        }
      }
    }
  }
  if (!parentPublished) {
    if (doc.project_id) { const { data: p } = await sbAdmin.from('developer_projects').select('publish_status').eq('id', doc.project_id).maybeSingle(); parentPublished = p?.publish_status === 'published' }
    else if (doc.site_id) { const { data: s } = await sbAdmin.from('sites').select('site_status').eq('id', doc.site_id).maybeSingle(); parentPublished = s?.site_status === 'published' }
  }

  const decision = decideAccess(doc, { isAdmin, isOwner, parentPublished })
  if (!decision.allowed) return notFound()

  const ref = parseCloudinaryUrl(doc.document_url)
  const key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  let url = doc.document_url as string, kind: 'signed' | 'stored' = 'stored', expiresInSeconds: number | null = null
  if (ref && ref.deliveryType !== 'upload' && key && secret) {
    const s = privateDownloadUrl(ref, { apiKey: key, apiSecret: secret }); url = s.url; kind = 'signed'; expiresInSeconds = 300
  } else if (ref && ref.deliveryType !== 'upload') {
    return NextResponse.json({ error: 'This file is stored privately but signed access is not configured (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are missing).' }, { status: 503 })
  }

  if (req.nextUrl.searchParams.get('r') === '1') {
    if (decision.via !== 'public') return NextResponse.json({ error: 'Use the in-app viewer for this document.' }, { status: 403 })
    return NextResponse.redirect(url, 302)
  }
  // `publicLink` tells admins when a NON-public document is nevertheless reachable by anyone holding its stored link.
  return NextResponse.json({ url, kind, expiresInSeconds, via: decision.via, publicLink: hasPublicLink(doc.document_url), name: doc.document_name })
}