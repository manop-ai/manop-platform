// lib/supabase/route-client.ts
//
// The server-side counterpart to lib/supabase/client.ts (the browser
// singleton) and lib/supabase/admin.ts (the service-role client).
// Neither of those fits an API route that needs to act AS THE
// CALLER — respecting their RLS, not bypassing it — which is what
// every Site Studio route needs (scenario creation is open to
// anyone, but should still carry whoever's signed in, e.g. for
// created_by_user_id). That requires a NEW client per request,
// carrying that request's own Authorization header, which is exactly
// what this factory does — so every route calls this one function
// instead of each repeating `createClient(url, key, authHeader...)`
// inline. Never call `createClient` directly in a route file; import
// this instead. Use lib/supabase/admin.ts only for privileged writes
// that must bypass RLS entirely.

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export function sbFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )
}