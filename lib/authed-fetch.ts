// lib/authed-fetch.ts
//
// Attaches the current user's session token to a same-origin API call.
// Site Intelligence's client pages were calling fetch() directly with
// no Authorization header, so every route that reads
// req.headers.get('authorization') to resolve auth.uid() — intake,
// quick-review, appraisals, request-review, admin evidence, admin
// review — never saw a signed-in session. submitted_by_user_id and
// reviewed_by were always written null regardless of who was logged in.
//
// Reuses the existing shared `supabase` client (lib/supabase.ts)
// rather than creating a second browser client instance.

import { sb } from './supabase/client'

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await sb.auth.getSession()
  return session?.access_token ?? null
}

// Drop-in replacement for fetch() on same-origin API routes. Signed-out
// users still get a normal unauthenticated request — every one of
// these routes is intentionally open to anonymous submission — this
// just attaches a signed-in user's session when one exists.
export async function authedFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}