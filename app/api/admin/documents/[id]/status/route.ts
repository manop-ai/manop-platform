// app/api/admin/documents/[id]/status/route.ts
//
// Updates developer_documents.status. The v3 migration's
// sync_developer_document_verified trigger keeps the legacy
// `verified` boolean in sync automatically — nothing else needed
// here for that.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { status, verification_note, publicly_visible } = await req.json()

  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  const { data: { user } } = await sb.auth.getUser()

  const update: Record<string, unknown> = {}
  if (status !== undefined) {
    update.status = status
    update.verification_note = verification_note ?? null
    update.verified_by = user?.id ?? null
  }
  if (publicly_visible !== undefined) {
    update.publicly_visible = publicly_visible
  }

  const { error } = await sb
    .from('developer_documents')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}