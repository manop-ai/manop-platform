// app/api/developer/projects/route.ts
//
// A developer creates, edits and submits their OWN development. One route, two actions:
//   save   -> a draft (publish_status 'draft'), editable until submitted
//   submit -> draft becomes 'pending_review', which puts it in MANOP's existing Review Submissions queue
//
// This never publishes: 'published' and 'rejected' are set only by MANOP's review pages. The caller is
// identified from their token; the developer account is resolved from the database (my_developer_account_id),
// never from the body, and an existing project is touched only if it belongs to that account and is
// still a draft. The service role is used only after those checks.
//
// Written columns are those the agency submission flow already writes to developer_projects and
// developer_unit_types. submitted_via / entry_source are left to their database defaults on purpose:
// lib/submission-origin.ts documents that developer-created projects carry the default.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sendAdminNotification, notificationHtml } from '../../../../lib/email'
import { logDevelopmentChange } from '../../../../lib/log-development-change'
import { cleanDraft, cleanUnits, nextStatus, validateSubmit, type ProjectInput, type UnitInput } from '../../../../lib/developer-project'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  try {
    const caller = sbFromRequest(req)
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return bad('Sign in required.', 401)

    const { data: devId } = await caller.rpc('my_developer_account_id')
    if (!devId) return bad('A developer account is required to add a development.', 403)

    const body = await req.json() as { action?: string; id?: string; project?: ProjectInput; units?: UnitInput[] }
    if (body.action !== 'save' && body.action !== 'submit') return bad('Unknown action.')
    if (!body.project) return bad('Development details are required.')

    const draft = cleanDraft(body.project)
    if ('error' in draft) return bad(draft.error)
    const units = body.units === undefined ? null : cleanUnits(body.units)
    if (units && 'error' in units) return bad(units.error)

    // Existing project: must be this developer's own, and still a draft.
    let existing: { id: string; publish_status: string } | null = null
    if (body.id) {
      const { data: p } = await sbAdmin.from('developer_projects').select('id, developer_id, publish_status').eq('id', body.id).maybeSingle()
      if (!p || p.developer_id !== devId) return bad('Development not found.', 404)   // same answer for "not yours"
      existing = { id: p.id, publish_status: p.publish_status }
    }

    const step = nextStatus(body.action, existing ? existing.publish_status : null)
    if ('error' in step) return bad(step.error, 409)

    if (body.action === 'submit') {
      let unitCount = units && 'value' in units ? units.value.length : 0
      if (!units && existing) {
        const { count } = await sbAdmin.from('developer_unit_types').select('id', { count: 'exact', head: true }).eq('project_id', existing.id)
        unitCount = count ?? 0
      }
      const problem = validateSubmit(draft.value, unitCount)
      if (problem) return bad(problem)
    }

    // ── write the project ──
    let projectId: string
    if (existing) {
      const { data: upd, error } = await sbAdmin.from('developer_projects')
        .update({ ...draft.value, publish_status: step.status })
        .eq('id', existing.id).eq('developer_id', devId).eq('publish_status', 'draft')
        .select('id').maybeSingle()
      if (error) return bad(error.message, 500)
      if (!upd) return bad('This development changed while you were editing it. Reload and try again.', 409)
      projectId = upd.id
    } else {
      // partner_submitted marks a development the partner created, so MANOP can require a completed agreement before publishing it
      // (sql/phase28). Until that migration is applied the column is missing: save without it rather than lose the partner's work.
      const row = { ...draft.value, developer_id: devId, publish_status: step.status, active: true }
      let { data: created, error } = await sbAdmin.from('developer_projects').insert({ ...row, partner_submitted: true }).select('id').single()
      if (error && (error.code === '42703' || error.code === 'PGRST204' || /partner_submitted/.test(error.message))) {
        ;({ data: created, error } = await sbAdmin.from('developer_projects').insert(row).select('id').single())
      }
      if (error || !created) return bad(error?.message ?? 'Could not save the development.', 500)
      projectId = created.id
    }

    // ── units: insert the new set first, then remove the old one, so a failure never leaves a draft with none ──
    if (units && 'value' in units) {
      const { data: old } = await sbAdmin.from('developer_unit_types').select('id').eq('project_id', projectId)
      if (units.value.length > 0) {
        const { error: unitErr } = await sbAdmin.from('developer_unit_types').insert(units.value.map(u => ({ ...u, project_id: projectId })))
        if (unitErr) return bad(`The development was saved, but its unit types were not: ${unitErr.message}`, 500)
      }
      const oldIds = (old ?? []).map(r => r.id)
      if (oldIds.length > 0) await sbAdmin.from('developer_unit_types').delete().in('id', oldIds)
    }

    if (body.action === 'submit') {
      void logDevelopmentChange(sbAdmin, 'development_submitted', {
        projectId, projectName: draft.value.name, neighborhood: draft.value.neighborhood, city: draft.value.city,
        countryCode: draft.value.country_code, actorUserId: user.id, actorRole: 'developer',
      }, { developer_id: devId })
      void sendAdminNotification(
        `Development submitted for review — ${draft.value.name}`,
        notificationHtml('Developer submitted a development for review', [
          ['Development', draft.value.name], ['Location', draft.value.location], ['Project ID', projectId],
          ['Where to review', 'Admin > Developments > Review submissions'],
        ]),
      ).catch(() => { /* email is supplementary; the review queue is the source of truth */ })
    }

    return NextResponse.json({ ok: true, id: projectId, status: step.status })
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : 'Server error', 500)
  }
}