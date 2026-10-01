// app/api/admin/sites/[id]/review/route.ts
//
// Writes review notes/considerations, sets reviewed_at when marked
// reviewed, and attempts to publish if requested. The mandate-gate
// trigger (v5 migration) enforces the fraud check at the database
// level — if it rejects the publish, that Postgres error is passed
// straight back to the admin UI rather than swallowed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { review_notes, considerations, reviewed, publish } = await req.json()

  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  const { data: { user } } = await sb.auth.getUser()

  const update: Record<string, unknown> = {
    review_notes: review_notes || null,
    considerations: considerations || null,
  }

  if (reviewed) {
    update.reviewed_at = new Date().toISOString()
    update.reviewed_by = user?.id ?? null
  } else {
    update.reviewed_at = null
    update.reviewed_by = null
  }

  if (publish) {
    if (!reviewed) {
      return NextResponse.json({ error: 'Mark as reviewed before publishing.' }, { status: 400 })
    }
    update.site_status = 'published'
  } else if (update.reviewed_at) {
    update.site_status = 'pending_review'
  }

  const { error } = await sb.from('sites').update(update).eq('id', params.id)

  if (error) {
    // A rejected mandate-gate trigger surfaces here as a plain
    // Postgres error — pass its message through as-is rather than
    // masking it, since it's already written to be admin-readable.
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}