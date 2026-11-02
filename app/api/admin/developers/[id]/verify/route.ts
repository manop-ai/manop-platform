// POST /api/admin/developers/[id]/verify  { verified: boolean } — a MANOP admin marks a developer account verified (or removes it).
// This is the ONLY place developer_accounts.verified is set; sql/phase31_developer_verification.sql stops anyone else from setting it.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '../../../../../../lib/admin-guard'
import { sbAdmin } from '../../../../../../lib/supabase/admin'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireStaff(req, 'developments')
  if ('error' in g) return g.error
  const body = await req.json().catch(() => ({})) as { verified?: unknown }
  if (typeof body.verified !== 'boolean') return NextResponse.json({ error: 'verified must be true or false.' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Invalid developer id.' }, { status: 400 })

  const stamp = { verified: body.verified, verified_at: body.verified ? new Date().toISOString() : null, verified_by: body.verified ? g.user.id : null }
  let { data, error } = await sbAdmin.from('developer_accounts').update(stamp).eq('id', params.id).select('id, verified').maybeSingle()
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    // phase31 not applied yet: the audit columns are missing, so set the flag alone.
    ;({ data, error } = await sbAdmin.from('developer_accounts').update({ verified: body.verified }).eq('id', params.id).select('id, verified').maybeSingle())
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Developer not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, verified: data.verified })
}