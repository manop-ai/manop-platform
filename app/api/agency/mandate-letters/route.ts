// app/api/agency/mandate-letters/route.ts — an agency uploads its mandate letter THROUGH MANOP (no document links accepted).
//   GET   own letters (status, review note, dates). Never returns storage identifiers or links.
//   POST  { action:'sign', filename, bytes, project_id?, replaces_id? }  validate, reserve a letter, return a signed one-file upload to PRIVATE Cloudinary
//         { action:'complete', letter_id }                                server checks what was stored (private? size? real file type?) before accepting it
//         { action:'fail', letter_id }                                    the browser upload failed; mark it so the agency can retry
// Authorisation is the signed-in agency owning the letter. Hidden buttons are not relied on.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { validateUpload, publicIdFor, ownerView } from '../../../../lib/mandate-letter'
import { cloudConfig, signedUploadFor, verifyUploadedAsset, deleteAsset } from '../../../../lib/mandate-letter-server'
import { logLetterEvent, isMissingTable } from '../../../../lib/mandate-letter-db'
import { escapeHtml, notificationHtml, sendAdminNotification, adminEmailConfig } from '../../../../lib/email'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function agencyOf(req: NextRequest) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: bad('Sign in required.', 401) } as const
  const { data: agency } = await sb.from('data_partners').select('id,name,active').eq('auth_user_id', user.id).maybeSingle()
  if (!agency) return { error: bad('Mandate letters are uploaded from an agency account.', 403) } as const
  return { user, agency } as const
}

export async function GET(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    const { data, error } = await sbAdmin.from('agency_mandate_letters').select('id,project_id,original_filename,bytes,format,status,review_note,uploaded_at,reviewed_at,version,created_at')
      .eq('agency_id', a.agency.id).not('status', 'in', '(pending_upload,upload_failed,removed)').order('created_at', { ascending: false }).limit(50)
    if (error) return isMissingTable(error) ? NextResponse.json({ unavailable: true, letters: [] }) : bad('Could not load your letters.', 500)
    return NextResponse.json({ letters: (data ?? []).map(ownerView), uploadsConfigured: !!cloudConfig() })
  } catch (e) { console.error('GET mandate-letters', e); return bad('Could not load your letters.', 500) }
}

export async function POST(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    const cfg = cloudConfig()
    if (!cfg) return bad('Document upload is not configured yet (storage credentials are missing). Please contact MANOP.', 503)

    if (b.action === 'sign') {
      if (a.agency.active === false) return bad('This agency account is not active.', 409)
      const v = validateUpload({ filename: b.filename, bytes: b.bytes }); if (!v.ok) return bad(v.error!)
      let projectId: string | null = null
      if (typeof b.project_id === 'string' && b.project_id) {
        if (!UUID.test(b.project_id)) return bad('Invalid development.')
        const { data: p } = await sbAdmin.from('developer_projects').select('id').eq('id', b.project_id).eq('submitting_agency_id', a.agency.id).maybeSingle()
        if (!p) return bad('That development was not submitted by your agency.', 403)
        projectId = p.id
      }
      let supersedes: string | null = null, version = 1
      if (typeof b.replaces_id === 'string' && b.replaces_id) {
        const { data: old } = await sbAdmin.from('agency_mandate_letters').select('id,version,status').eq('id', b.replaces_id).eq('agency_id', a.agency.id).maybeSingle()
        if (!old) return bad('The letter you are replacing was not found.', 404)
        if (['superseded', 'removed'].includes(old.status)) return bad('That letter has already been replaced or removed.', 409)
        supersedes = old.id; version = old.version + 1
      }
      const { count } = await sbAdmin.from('agency_mandate_letters').select('id', { count: 'exact', head: true }).eq('agency_id', a.agency.id).eq('status', 'pending_upload')
      if ((count ?? 0) >= 5) return bad('You have several unfinished uploads. Finish or retry those first.', 429)

      const id = randomUUID()
      const publicId = publicIdFor(a.agency.id, id, v.ext!)
      const { error } = await sbAdmin.from('agency_mandate_letters').insert({ id, agency_id: a.agency.id, project_id: projectId, version, status: 'pending_upload', visibility: 'internal', original_filename: v.filename, format: v.ext === 'jpeg' ? 'jpg' : v.ext, bytes: v.bytes, cloudinary_public_id: publicId, uploaded_by: a.user.id, supersedes_id: supersedes })
      if (error) return isMissingTable(error) ? bad('Mandate letter upload is not switched on yet.', 503) : bad('Could not start the upload. Please try again.', 500)
      await logLetterEvent({ letter_id: id, agency_id: a.agency.id, event_type: 'upload_started', actor_user_id: a.user.id, actor_role: 'agency', detail: { filename: v.filename, bytes: v.bytes, replaces: supersedes } })
      return NextResponse.json({ letter_id: id, upload: signedUploadFor(cfg, publicId) })
    }

    if (b.action === 'complete' || b.action === 'fail') {
      if (typeof b.letter_id !== 'string' || !UUID.test(b.letter_id)) return bad('Invalid letter.')
      const { data: l } = await sbAdmin.from('agency_mandate_letters').select('*').eq('id', b.letter_id).eq('agency_id', a.agency.id).maybeSingle()
      if (!l) return bad('Letter not found.', 404)
      if (l.status !== 'pending_upload') return NextResponse.json({ letter: ownerView(l), duplicate: true })        // retry / double click safe
      const now = new Date().toISOString()
      if (b.action === 'fail') {
        await sbAdmin.from('agency_mandate_letters').update({ status: 'upload_failed', updated_at: now }).eq('id', l.id).eq('status', 'pending_upload')
        await deleteAsset(cfg, l.cloudinary_public_id)
        await logLetterEvent({ letter_id: l.id, agency_id: l.agency_id, event_type: 'upload_failed', actor_user_id: a.user.id, actor_role: 'agency' })
        return NextResponse.json({ ok: true })
      }
      const v = await verifyUploadedAsset(cfg, { publicId: l.cloudinary_public_id, declaredExt: l.format })
      if (!v.ok) {
        await sbAdmin.from('agency_mandate_letters').update({ status: 'upload_failed', updated_at: now }).eq('id', l.id).eq('status', 'pending_upload')
        await logLetterEvent({ letter_id: l.id, agency_id: l.agency_id, event_type: 'upload_rejected_by_check', actor_user_id: null, actor_role: 'system', detail: { reason: (v as any).error } })
        return bad((v as any).error, 422)
      }
      const { data: upd } = await sbAdmin.from('agency_mandate_letters').update({ status: 'uploaded', uploaded_at: now, bytes: v.bytes, format: v.format, updated_at: now }).eq('id', l.id).eq('status', 'pending_upload').select('*').maybeSingle()
      if (!upd) return NextResponse.json({ letter: ownerView(l), duplicate: true })
      if (l.supersedes_id) {
        // The replaced letter stays on record (audit) but is no longer current, and can never remain public.
        await sbAdmin.from('agency_mandate_letters').update({ status: 'superseded', visibility: 'internal', updated_at: now }).eq('id', l.supersedes_id).eq('agency_id', a.agency.id)
        await logLetterEvent({ letter_id: l.supersedes_id, agency_id: l.agency_id, event_type: 'superseded', actor_user_id: a.user.id, actor_role: 'agency', detail: { by: l.id } })
        if (l.project_id) await sbAdmin.from('developer_projects').update({ mandate_letter_id: l.id }).eq('id', l.project_id).eq('submitting_agency_id', a.agency.id)
      }
      await logLetterEvent({ letter_id: l.id, agency_id: l.agency_id, event_type: l.supersedes_id ? 'replacement_uploaded' : 'uploaded', actor_user_id: a.user.id, actor_role: 'agency', detail: { bytes: v.bytes, format: v.format } })
      if (adminEmailConfig().configured) { try { await sendAdminNotification(`Mandate letter uploaded: ${escapeHtml(a.agency.name)}`, notificationHtml('Mandate letter uploaded', [['Agency', escapeHtml(a.agency.name)], ['Review', '/admin/mandate-letters']])) } catch { /* recorded regardless */ } }
      return NextResponse.json({ letter: ownerView(upd) }, { status: 201 })
    }
    return bad('Unknown action.')
  } catch (e) { console.error('POST mandate-letters', e); return bad('Something went wrong. Please try again.', 500) }
}