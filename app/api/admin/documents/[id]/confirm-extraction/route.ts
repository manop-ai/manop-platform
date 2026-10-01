// app/api/admin/documents/[id]/confirm-extraction/route.ts
//
// The human half of the extraction pipeline. `extracted_data` is
// written by /api/documents/extract as a proposal; this is the ONLY
// route that can move it to extraction_status = 'confirmed'. Nothing
// automatically confirms itself — see the file header on
// app/api/documents/extract/route.ts for why that matters.
//
// Rejecting doesn't delete extracted_data (it stays visible as a
// point of reference) — it just marks the status so nothing treats
// it as fact.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { confirmed } = await req.json() as { confirmed: boolean }

  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  const { data: { user } } = await sb.auth.getUser()

  const { error } = await sb
    .from('developer_documents')
    .update({
      extraction_status: confirmed ? 'confirmed' : 'not_attempted',
      extraction_confirmed_by: confirmed ? (user?.id ?? null) : null,
      extraction_confirmed_at: confirmed ? new Date().toISOString() : null,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}