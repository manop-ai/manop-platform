// app/api/admin/sites/[id]/evidence/route.ts
//
// Inserts a manually-recorded evidence/data-source finding into
// site_intelligence_layers — the admin counterpart to the automated
// spatial intersection. Same table, same provenance columns.
//
// Auth model: the caller is verified as admin by requireAdmin(), then the
// write goes through the service-role client. site_intelligence_layers has
// no user-facing write policy by design (MANOP-curated data), so this is
// the correct path rather than loosening RLS.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../../lib/require-admin'
import { sbAdmin } from '../../../../../../lib/supabase/admin'

const CATEGORIES = ['survey_plan','planning','environmental','infrastructure','development_activity','market_context']
const SOURCE_TYPES = ['official_government','professional_survey','user_submitted','third_party_public','manop_derived']
const STATUSES = ['provided','source_derived','cross_referenced','reviewed','unable_to_establish','requires_further_verification']
const CONFIDENCES = ['high','medium','low','unconfirmed']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  if (!CATEGORIES.includes(body.layer_category)) return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
  if (!SOURCE_TYPES.includes(body.source_type)) return NextResponse.json({ error: 'Invalid source type.' }, { status: 400 })
  if (!STATUSES.includes(body.evidence_status)) return NextResponse.json({ error: 'Invalid evidence status.' }, { status: 400 })
  if (!CONFIDENCES.includes(body.confidence)) return NextResponse.json({ error: 'Invalid confidence.' }, { status: 400 })
  if (!body.label || !body.source || !body.layer_type) return NextResponse.json({ error: 'Label and source are required.' }, { status: 400 })

  const { error } = await sbAdmin.from('site_intelligence_layers').upsert({
    site_id: params.id,
    layer_category: body.layer_category,
    layer_type: body.layer_type,
    label: body.label,
    value_summary: body.value_summary ?? null,
    fact: body.fact ?? null,
    consideration: body.consideration ?? null,
    source: body.source,
    source_type: body.source_type,
    source_date: body.source_date ?? null,
    confidence: body.confidence,
    evidence_status: body.evidence_status,
  }, { onConflict: 'site_id,layer_type' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}