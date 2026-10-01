// app/api/shared/scenarios/[token]/route.ts
//
// PUBLIC, unauthenticated, READ-ONLY. Serves /site-intelligence/shared/[token].
//
// Calls the REAL, already-deployed sharing RPC — get_shared_scenario_report —
// confirmed live via direct inspection of pg_proc. It already exists, already
// handles revoked_at/expires_at and view-count tracking, and already returns
// more than the previous draft attempted (evidence, investigation_items). This
// route does NOT re-implement any of that.
//
// It DOES filter the RPC's response before it reaches the client, in two ways
// that are this route's own decision, not a change to the database function:
//   1. Strips internal linkage fields from `scenario` (created_by_user_id,
//      preset_id, duplicated_from_id, superseded_by_id, parameters_json) —
//      pure internal IDs/JSON with no display value to a public viewer.
//   2. Does NOT forward `evidence` or `investigation_items` at all. Checked
//      for an existing MANOP mechanism to gate this safely before deciding to
//      omit it — none exists (fact/consideration are shown identically, not
//      split by audience; developer_documents.publicly_visible is a different
//      table, arguably a different visibility tier). Full findings and the
//      smallest proposed schema change, NOT applied, are in
//      sql/2026_site_studio_shared_view.sql. This is the interim safety
//      measure the investigation explicitly allows when no safe mechanism
//      exists — not a permanent design decision, and not something to "fix"
//      by passing the field through.
//
// Editor-mode sharing is NOT implemented: scenario_shares has no permission
// column (confirmed via information_schema.columns), so every link here is
// view-only by construction — there is nothing to accidentally expose.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { shapeSharedScenarioResponse } from '../../../../../lib/shared-scenario-response'

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token
  if (!token || token.length < 8 || token.length > 200) {
    return NextResponse.json({ error: 'This share link is not valid.' }, { status: 404 })
  }

  const sb = sbFromRequest(req)
  const rpcResult = await sb.rpc('get_shared_scenario_report', { p_token: token })
  const { status, body } = shapeSharedScenarioResponse(rpcResult)
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}