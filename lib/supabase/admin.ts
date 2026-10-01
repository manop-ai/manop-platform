// lib/supabase/admin.ts
//
// THE canonical service-role client. SERVER-SIDE ONLY — never import this
// from a 'use client' component or anything that ships to the browser.
// Use inside Route Handlers (app/api/**/route.ts) and Server Actions that
// need to bypass RLS on the caller's behalf (e.g. accepting an anonymous
// buyer enquiry and writing it as a trusted system action).
//
// This replaces a pattern found in two live routes:
//
//   createClient(url, process.env.SUPABASE_SECRET_KEY || PUBLISHABLE_KEY)
//
// That `||` silently downgrades to the PUBLIC anon key if the secret key
// env var is ever missing or misnamed in the deployment environment —
// the route keeps running, but every insert then goes through as anon
// and gets silently blocked by RLS instead of failing loudly. Since
// these two routes are the only entry points for the buyer→lead pipeline
// (app/api/developer-leads/route.ts, app/api/inquiries/route.ts), a
// misconfigured env var there would silently drop enquiries — the worst
// possible failure mode for the thing MANOP's success fee depends on.
// This version throws immediately and loudly instead.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url) {
  throw new Error(
    'lib/supabase/admin.ts: NEXT_PUBLIC_SUPABASE_URL is not set.',
  )
}

if (!secretKey) {
  throw new Error(
    'lib/supabase/admin.ts: SUPABASE_SECRET_KEY is not set. Refusing to ' +
    'fall back to the publishable key for a service-role client — this ' +
    'would silently subject privileged writes to RLS as an anonymous ' +
    'user. Set SUPABASE_SECRET_KEY in the deployment environment.',
  )
}

export const sbAdmin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})