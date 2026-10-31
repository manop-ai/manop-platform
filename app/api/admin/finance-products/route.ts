// app/api/admin/finance-products/route.ts
//
// Admin management of lender products. GET lists everything (active + withdrawn + stale) for the admin table;
// POST records a new one.
//
// Authorization: requireAdmin() (token -> is_manop_admin(), which reads admin_users; never user_metadata) AND
// the caller-scoped client, so the finance_products RLS policy is a second, independent check.
//
// Every failure comes back as JSON { error } with a status, never a hung request or an HTML error page: the whole
// handler is inside try/catch (the Lender Products "Saving…" button used to be able to wait forever on a thrown error).
//
// A product recorded here is evidence MANOP has gathered, not a lender's confirmation. verification_status says
// which: researched_public | third_party | provider_confirmed | awaiting_confirmation.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/require-admin'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { validateProductInput, isMissingColumnError, LEGACY_PRODUCT_COLUMNS } from '../../../../lib/finance-products'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

export async function GET(req: NextRequest) {
  try {
    const adm = await requireAdmin(req)
    if (!adm.ok) return json({ error: adm.error }, adm.status)
    const sb = sbFromRequest(req)
    const { data, error } = await sb.from('finance_products').select('*').order('created_at', { ascending: false })
    if (error) return json({ error: error.message }, 400)
    return json({ products: data })
  } catch (e: unknown) {
    console.error('GET /api/admin/finance-products', e)
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const adm = await requireAdmin(req)
    if (!adm.ok) return json({ error: adm.error }, adm.status)

    let body: Record<string, any>
    try { body = await req.json() } catch { return json({ error: 'The request body is not valid JSON.' }, 400) }

    const v = validateProductInput(body)
    if (!v.ok) return json({ error: v.errors.join(' '), errors: v.errors }, 400)

    const sb = sbFromRequest(req)
    const row: Record<string, unknown> = { ...v.value, status: 'active', created_by_user_id: adm.user.id }
    let { data, error } = await sb.from('finance_products').insert(row).select().single()
    let extended = true
    let dropped: string[] = []

    if (error && isMissingColumnError(error)) {
      // sql/phase17 has not been applied: save what the original table can hold, and say exactly what was not stored.
      const keep = new Set([...LEGACY_PRODUCT_COLUMNS, 'created_by_user_id'])
      const legacyRow = Object.fromEntries(Object.entries(row).filter(([k]) => keep.has(k)))
      dropped = Object.keys(row).filter(k => !keep.has(k) && row[k] != null && !(Array.isArray(row[k]) && (row[k] as unknown[]).length === 0))
      const retry = await sb.from('finance_products').insert(legacyRow).select().single()
      data = retry.data; error = retry.error; extended = false
    }
    if (error) return json({ error: error.message, code: error.code }, 400)

    // Audit trail: best effort. The product is saved either way; the response says if the trail could not be written.
    let audit: 'recorded' | 'unavailable' = 'recorded'
    const ev = await sb.from('finance_product_events').insert({
      product_id: String((data as any).id), event_type: 'created', verification_status: (v.value.verification_status as string) ?? null,
      verified_at: v.value.last_verified_at ?? null, source_name: v.value.source_name ?? null, source_url: v.value.source_url ?? null, actor_user_id: adm.user.id,
    })
    if (ev.error) audit = 'unavailable'

    return json({
      product: data, extended, audit,
      warning: extended ? undefined : `Saved with the original fields only. These were NOT stored until sql/phase17_finance_product_register.sql is applied: ${dropped.join(', ') || 'none'}.`,
    }, 201)
  } catch (e: unknown) {
    console.error('POST /api/admin/finance-products', e)
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
}