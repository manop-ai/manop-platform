// app/api/admin/mandate-letters/route.ts — admin review of mandate letters.
//   GET    letters with agency, development, who uploaded / reviewed / changed visibility, and the audit trail
//   PATCH  { id, action: 'start_review'|'approve'|'request_changes'|'reject'|'set_visibility'|'remove', note?, visibility? }
// MANOP admin only (is_manop_admin) before any service-role write. Review outcome and visibility are SEPARATE decisions: approving never
// makes a letter public; only an explicit set_visibility 'public' (with a recorded reason) does, and it can be withdrawn the same way.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/admin-guard'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { UUID_RE } from '../../../../lib/agreements-server'
import { planAdminAction, type AdminAction } from '../../../../lib/mandate-letter'
import { cloudConfig, deleteAsset } from '../../../../lib/mandate-letter-server'
import { logLetterEvent, isMissingTable } from '../../../../lib/mandate-letter-db'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const ACTIONS: AdminAction[] = ['start_review', 'approve', 'request_changes', 'reject', 'set_visibility', 'remove']

export async function GET(req: NextRequest) {
  try {
    const g = await requireAdmin(req); if ('error' in g) return g.error
    const { data, error } = await sbAdmin.from('agency_mandate_letters')
      .select('id,agency_id,project_id,version,status,visibility,original_filename,format,bytes,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_note,visibility_changed_by,visibility_changed_at,supersedes_id,created_at, data_partners(name,contact_email,verification_status), developer_projects:project_id(name,publish_status)')
      .not('status', 'in', '(pending_upload)').order('created_at', { ascending: false }).limit(300)
    if (error) return isMissingTable(error) ? NextResponse.json({ letters: [], unavailable: true }) : bad(error.message, 500)
    const ids = (data ?? []).map(l => l.id)
    const { data: ev } = ids.length ? await sbAdmin.from('mandate_letter_events').select('*').in('letter_id', ids).order('created_at', { ascending: false }).limit(1000) : { data: [] as any[] }
    return NextResponse.json({ letters: (data ?? []).map(l => ({ ...l, events: (ev ?? []).filter(e => e.letter_id === l.id) })), uploadsConfigured: !!cloudConfig() })
  } catch (e) { console.error('GET admin mandate-letters', e); return bad('Server error', 500) }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await requireAdmin(req); if ('error' in g) return g.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return bad('Invalid letter.')
    if (!ACTIONS.includes(b.action as AdminAction)) return bad('Unknown action.')
    const { data: l } = await sbAdmin.from('agency_mandate_letters').select('*').eq('id', b.id).maybeSingle()
    if (!l) return bad('Letter not found.', 404)

    const plan = planAdminAction(l, { action: b.action as AdminAction, note: typeof b.note === 'string' ? b.note : null, visibility: b.visibility as any })
    if (!plan.ok) return bad(plan.error!, 409)
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { ...plan.patch, updated_at: now }
    if (b.action !== 'set_visibility') { patch.reviewed_by = g.user.id; patch.reviewed_at = now; if (typeof b.note === 'string' && b.note.trim()) patch.review_note = b.note.trim().slice(0, 2000) }
    if ('visibility' in (plan.patch ?? {}) && plan.patch!.visibility !== l.visibility) { patch.visibility_changed_by = g.user.id; patch.visibility_changed_at = now }

    // Guard on the status we read, so two admins acting at once cannot both succeed.
    const { data: upd, error } = await sbAdmin.from('agency_mandate_letters').update(patch).eq('id', l.id).eq('status', l.status).eq('visibility', l.visibility).select('id').maybeSingle()
    if (error) return bad('Could not record that decision.', 500)
    if (!upd) return bad('This letter changed while you were working. Reload and try again.', 409)

    if (b.action === 'remove') { const cfg = cloudConfig(); if (cfg && l.cloudinary_public_id) await deleteAsset(cfg, l.cloudinary_public_id) }
    await logLetterEvent({ letter_id: l.id, agency_id: l.agency_id, event_type: plan.event!, actor_user_id: g.user.id, actor_role: 'admin', detail: { note: typeof b.note === 'string' ? b.note.trim().slice(0, 500) : null, from: { status: l.status, visibility: l.visibility }, to: { status: patch.status ?? l.status, visibility: patch.visibility ?? l.visibility } } })
    // A letter that stops being accepted while a development still points to it must not leave that development publishable.
    return NextResponse.json({ ok: true })
  } catch (e) { console.error('PATCH admin mandate-letters', e); return bad('Server error', 500) }
}