// lib/supabase/server-read.ts
//
// THE canonical client for Server Components (async function pages/layouts
// with no 'use client'). Same anon/publishable key as lib/supabase/client.ts
// — same RLS behavior, nothing bypassed — but WITHOUT that client's
// browser-only auth options (persistSession, autoRefreshToken,
// detectSessionInUrl), which depend on `window`/`localStorage` and have no
// meaning during server-side rendering in Node.
//
// Found via a real bug: three Server Components (app/development/[id]/page.tsx,
// app/site-intelligence/sandbox/page.tsx, app/site-intelligence/[id]/page.tsx)
// were importing { sb } from lib/supabase/client.ts — a client whose own
// header comment says "THE canonical BROWSER Supabase client" — and using it
// during server-side rendering. That mismatch is the most likely cause of a
// generic `TypeError: fetch failed` surfacing on those pages: not a missing
// migration/column (a real schema error reads like
// `column sites.is_sandbox does not exist`, not a raw fetch failure), but the
// client's browser-oriented internals misbehaving with no `window` present.
//
// This does NOT read cookies or carry a signed-in user's identity — it is
// equivalent to an anonymous request, same as lib/supabase/client.ts before
// a session loads. If any of the three pages above actually need to read
// RLS-restricted, user-scoped data server-side, that requires a real
// cookie-based server client (the @supabase/ssr createServerClient pattern,
// reading auth cookies via next/headers) — NOT built here, since none of the
// three pages currently attempt to read a user's session at all (confirmed:
// no `.auth.getUser()` / `.auth.getSession()` call in any of them), so
// swapping to this anon-equivalent, Node-safe client changes nothing about
// what data they were already able to see.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const sbServerRead = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})