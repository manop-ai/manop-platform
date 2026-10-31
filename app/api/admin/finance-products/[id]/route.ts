// app/api/admin/finance-products/[id]/route.ts
//
// PATCH changes one lender product. No delete route: a product that is no longer current is WITHDRAWN, never
// deleted, so the register keeps a record of what MANOP once told people.
//
// Actions:
//   reverify    bump last_verified_at (default now, or the date the admin states; never future). Optionally record how it
//               was verified (verification_status), the source, and a note. Re-verifying is MANOP checking its
//               record; it does NOT by itself mean the provider confirmed anything.
//   update      edit fields (same validation as creation, only the supplied fields)
//   withdraw    status -> withdrawn (optional reason is kept in the audit trail)
//   reactivate  status -> active (a product that is still stale stays out of buyer matching until re-verified)
//
// Each change is appended to finance_product_events when sql/phase17 has been applied.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/require-admin'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { validateProductInput, isMissingColumnError } from '../../../../../lib/finance-products'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
const ACTIONS = ['reverify', 'update', 'withdraw', 'reactivate']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adm = await requireAdmin(req)
    if (!adm.ok) return json({ error: adm.error }, adm.status)

    let body: Record<string, any>
    try { body = await req.json() } catch { return json({ error: 'The request body is not valid JSON.' }, 400) }
    if (!ACTIONS.includes(body.action)) return json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, 400)

    const now = new Date().toISOString()
    const update: Record<string, unknown> = { updated_at: now }
    let eventType: string = body.action === 'update' ? 'updated' : body.action === 'reverify' ? 'reverified' : body.action === 'withdraw' ? 'withdrawn' : 'reactivated'
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null

    if (body.action === 'reverify') {
      const v = validateProductInput({
        last_verified_at: body.verified_at ?? now,
        ...(body.source_name !== undefined ? { source_name: body.source_name } : {}),
        ...(body.source_url !== undefined ? { source_url: body.source_url } : {}),
        ...(body.verification_status !== undefined ? { verification_status: body.verification_status } : {}),
      }, { partial: true })
      if (!v.ok) return json({ error: v.errors.join(' '), errors: v.errors }, 400)
      Object.assign(update, v.value)
    } else if (body.action === 'update') {
      const fields = (body.fields && typeof body.fields === 'object') ? body.fields : {}
      // status and identifiers are changed only through their own actions
      delete (fields as any).status; delete (fields as any).id; delete (fields as any).created_by_user_id
      const v = validateProductInput(fields, { partial: true })
      if (!v.ok) return json({ error: v.errors.join(' '), errors: v.errors }, 400)
      if (Object.keys(v.value).length === 0) return json({ error: 'Nothing to update.' }, 400)
      Object.assign(update, v.value)
      if ('verification_status' in v.value) eventType = 'verification_status_changed'
    } else if (body.action === 'withdraw') {
      update.status = 'withdrawn'
    } else {
      update.status = 'active'
    }

    const sb = sbFromRequest(req)
    const { data, error } = await sb.from('finance_products').update(update).eq('id', params.id).select().maybeSingle()
    if (error) {
      if (isMissingColumnError(error)) return json({ error: 'This change needs the Lender Products register migration (sql/phase17_finance_product_register.sql), which has not been applied.', code: error.code }, 503)
      return json({ error: error.message, code: error.code }, 400)
    }
    if (!data) return json({ error: 'No such product, or you do not have access to change it.' }, 404)

    const ev = await sb.from('finance_product_events').insert({
      product_id: String(params.id), event_type: eventType,
      verification_status: (update.verification_status as string) ?? (data as any).verification_status ?? null,
      verified_at: (update.last_verified_at as string) ?? null,
      source_name: (update.source_name as string) ?? null, source_url: (update.source_url as string) ?? null,
      note, actor_user_id: adm.user.id,
    })
    return json({ product: data, audit: ev.error ? 'unavailable' : 'recorded' })
  } catch (e: unknown) {
    console.error('PATCH /api/admin/finance-products/[id]', e)
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
}