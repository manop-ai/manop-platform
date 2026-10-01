// app/api/admin/sites/[id]/evidence/route.ts
//
// Inserts a manually-recorded evidence/data-source finding into
// site_intelligence_layers — the admin counterpart to the automated
// spatial intersection. Same table, same provenance columns, so a
// manually-added row and an automated one render identically on the
// Site Intelligence Profile page.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()

  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  const { error } = await sb.from('site_intelligence_layers').upsert({
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