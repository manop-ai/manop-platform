// app/api/developer/unit-terms/route.ts
//
// POST { unit_id, changes: {price_ngn?, deposit_pct?, installment_months?, available_count?, quantity?}, expected?: {...same keys}, update_id?: uuid }
// GET  ?unit_id=...   -> the history for one unit (the caller's own, or any if MANOP admin)
//
// The V1 rule: a developer may change the commercial terms of their own units directly, even once published. Every change is
// written to public.unit_term_changes by public.apply_unit_term_changes (sql/phase32), which also checks `expected` so two
// people editing the same unit cannot silently overwrite each other. MANOP is notified of material changes; that email never
// blocks the change. Who may call: the developer account that owns the project, or a MANOP admin. Agencies are not included
// (an open product decision; flagged in the report). The caller is identified from their token and ownership is resolved in the
// database, never from the body. The service role is used only after those checks.
//
// Not allowed here, by design: sold/reserved counts, adding or removing unit types on a published development (needs MANOP review).

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sendAdminNotification, notificationHtml } from '../../../../lib/email'
import { logDevelopmentChange } from '../../../../lib/log-development-change'
import { TERM_FIELDS, TERM_LABEL, describeChange, mapUnitTermsError, type TermField, type TermChanges } from '../../../../lib/unit-terms'

const bad = (error: string, status = 400, code?: string) => NextResponse.json({ error, code }, { status })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Who = { ok: true; userId: string; role: 'developer' | 'admin'; devId: string | null } | { ok: false; res: NextResponse }

async function whoIsCalling(req: NextRequest): Promise<Who> {
  const caller = sbFromRequest(req)
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return { ok: false, res: bad('Sign in required.', 401) }
  const { data: isAdmin } = await caller.rpc('is_manop_admin')
  if (isAdmin === true) return { ok: true, userId: user.id, role: 'admin', devId: null }
  const { data: devId } = await caller.rpc('my_developer_account_id')
  if (!devId) return { ok: false, res: bad('Only the developer who owns this development, or MANOP, can change its terms.', 403) }
  return { ok: true, userId: user.id, role: 'developer', devId: devId as string }
}

async function loadUnit(unitId: string) {
  const { data: unit } = await sbAdmin.from('developer_unit_types').select('id, project_id, unit_type').eq('id', unitId).maybeSingle()
  if (!unit) return null
  const { data: proj } = await sbAdmin.from('developer_projects')
    .select('id, name, developer_id, publish_status, neighborhood, city, country_code').eq('id', unit.project_id).maybeSingle()
  if (!proj) return null
  return { unit, proj }
}

function pick(obj: unknown): TermChanges | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const out: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!(TERM_FIELDS as readonly string[]).includes(k)) return null          // unknown field (e.g. sold_count): refuse the whole request
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) return null
    out[k] = v as number | null
  }
  return out as TermChanges
}

export async function POST(req: NextRequest) {
  try {
    const who = await whoIsCalling(req)
    if ('res' in who) return who.res
    const body = await req.json().catch(() => ({})) as { unit_id?: string; changes?: unknown; expected?: unknown; update_id?: string }
    if (!body.unit_id || !UUID.test(body.unit_id)) return bad('A valid unit is required.')
    const changes = pick(body.changes)
    if (!changes || Object.keys(changes).length === 0) return bad('Send at least one valid term to change (price, deposit, instalment period, units available or total units).')
    const expected = body.expected === undefined ? null : pick(body.expected)
    if (body.expected !== undefined && !expected) return bad('Invalid expected values.')
    if (body.update_id !== undefined && !UUID.test(body.update_id)) return bad('Invalid update.')

    const found = await loadUnit(body.unit_id)
    // the same answer for "does not exist" and "is not yours", so ids cannot be probed
    if (!found || (who.role === 'developer' && found.proj.developer_id !== who.devId)) return bad('Unit type not found.', 404, 'NOT_FOUND')
    const { unit, proj } = found

    const { data, error } = await sbAdmin.rpc('apply_unit_term_changes', {
      p_unit_id: unit.id, p_changes: changes, p_expected: expected, p_actor: who.userId, p_actor_role: who.role,
      p_source: body.update_id ? 'update_post' : who.role === 'admin' ? 'admin' : 'developer_dashboard', p_update_id: body.update_id ?? null,
    })
    if (error) {
      const m = mapUnitTermsError(error.message || '')
      return bad(m.error, m.status, m.code)
    }
    const result = data as { changed: Array<{ field: TermField; previous: number | null; new: number | null; material: boolean }>; material: boolean; batch_id: string; unit?: Record<string, number | null> }

    // Legacy per-update rows (the public "what changed" lines) for the two fields they already cover.
    if (body.update_id && result.changed.length) {
      const legacy = result.changed.filter(c => c.field === 'price_ngn' || c.field === 'available_count').map(c => ({
        update_id: body.update_id, project_id: proj.id, unit_type_id: unit.id, unit_label: unit.unit_type, field: c.field, previous_value: c.previous, new_value: c.new,
      }))
      if (legacy.length) await sbAdmin.from('development_update_changes').insert(legacy)   // best effort; unit_term_changes is the record
    }

    if (result.changed.length) {
      const ctx = { projectId: proj.id, projectName: proj.name, neighborhood: proj.neighborhood, city: proj.city, countryCode: proj.country_code, actorUserId: who.userId, actorRole: who.role === 'admin' ? 'admin' as const : 'developer' as const }
      for (const c of result.changed) {
        if (c.field === 'price_ngn') void logDevelopmentChange(sbAdmin, 'development_unit_price_changed', ctx, { unit_type_id: unit.id, from: c.previous, to: c.new })
        if (c.field === 'available_count') void logDevelopmentChange(sbAdmin, 'development_unit_availability_changed', ctx, { unit_type_id: unit.id, from: c.previous, to: c.new })
      }
      // MANOP is told about material changes on published developments. Failure to send never fails the change.
      if (result.material && proj.publish_status === 'published' && who.role === 'developer') {
        void sendAdminNotification(
          `Published terms changed — ${proj.name} (${unit.unit_type})`,
          notificationHtml('A developer changed published unit terms', [
            ['Development', proj.name], ['Unit type', unit.unit_type],
            ...result.changed.map(c => [TERM_LABEL[c.field], describeChange(c.field, c.previous, c.new).replace(/^[^:]+: /, '')] as [string, string]),
            ['Where to see it', 'Admin > Developments > Review submissions (history is permanent and cannot be edited)'],
          ]),
        ).catch(() => { /* supplementary */ })
      }
    }
    return NextResponse.json({ ok: true, changed: result.changed, unit: result.unit ?? null, material: result.material })
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : 'Server error', 500)
  }
}

export async function GET(req: NextRequest) {
  try {
    const who = await whoIsCalling(req)
    if ('res' in who) return who.res
    const unitId = new URL(req.url).searchParams.get('unit_id') || ''
    if (!UUID.test(unitId)) return bad('A valid unit is required.')
    const found = await loadUnit(unitId)
    if (!found || (who.role === 'developer' && found.proj.developer_id !== who.devId)) return bad('Unit type not found.', 404, 'NOT_FOUND')
    const { data, error } = await sbAdmin.from('unit_term_changes')
      .select('id, field, previous_value, new_value, actor_role, source, created_at, material').eq('unit_type_id', unitId).order('created_at', { ascending: false }).limit(100)
    if (error) {
      const m = mapUnitTermsError(error.message || '')
      return m.status === 503 ? NextResponse.json({ history: [], pending_migration: true }) : bad(m.error, m.status, m.code)
    }
    return NextResponse.json({ history: data ?? [] })
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : 'Server error', 500)
  }
}