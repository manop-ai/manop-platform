import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

export async function GET(req: NextRequest) {
  return refresh(req)
}

export async function POST(req: NextRequest) {
  return refresh(req)
}

async function refresh(req: NextRequest) {
  // SECURITY FIX: this used to be open whenever CRON_SECRET was unset, and read the secret from a query string (which ends up in logs).
  // It now fails closed. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically once CRON_SECRET is set in the project's
  // environment variables, so the scheduled run works with no extra setup. An admin can also run it by hand with the same header.
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 503 })
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const startedAt = Date.now()
  const errors: string[] = []
  let associationsUpdated = 0

  const { error: platformError } = await sb.rpc('compute_platform_intelligence', { p_country_code: 'NG' })
  if (platformError) errors.push(`Platform intelligence: ${platformError.message}`)

  const { data: associations, error: associationError } = await sb
    .from('associations')
    .select('id, name')
    .eq('status', 'active')

  if (associationError) {
    errors.push(`Association lookup: ${associationError.message}`)
  } else {
    for (const association of associations ?? []) {
      const { error } = await sb.rpc('compute_association_intelligence', {
        p_association_id: association.id,
      })
      if (error) errors.push(`${association.name}: ${error.message}`)
      else associationsUpdated++
    }
  }

  const { error: expiryError } = await sb.from('activity_log').delete()
    .lt('expires_at', new Date().toISOString())
    .not('expires_at', 'is', null)
  if (expiryError) errors.push(`Signal expiry: ${expiryError.message}`)

  return NextResponse.json({
    ok: errors.length === 0,
    elapsed_ms: Date.now() - startedAt,
    associations_updated: associationsUpdated,
    errors,
  })
}
