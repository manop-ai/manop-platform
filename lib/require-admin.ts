// lib/require-admin.ts
//
// SERVER-SIDE ONLY. Verifies the caller's bearer token with Supabase Auth and confirms they
// are a MANOP admin, then the route writes with sbAdmin.
//
// SECURITY FIX: this used to accept `user_metadata.user_role === 'admin'`. Users can edit their
// own user_metadata (supabase.auth.updateUser({ data: { user_role: 'admin' } })), so any signed-in
// user could pass this guard and then write through the service role. It now asks the database
// (is_manop_admin()), the same check lib/admin-guard.ts and the RLS policies use.
//
// If an existing admin is refused here after this change, fix the admin record through the
// protected admin process that is_manop_admin() reads. Do not re-add a metadata fallback.
// (The body of is_manop_admin() has not been verified from this repository: run
// sql/phase15_verify.sql block 1 and confirm it does not itself read user_metadata.)

import { NextRequest } from 'next/server'
import { sbFromRequest } from './supabase/route-client'

export async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return { ok: false as const, status: 401, error: 'Not signed in.' }

  const sb = sbFromRequest(req)
  const { data: { user }, error } = await sb.auth.getUser()
  if (error || !user) return { ok: false as const, status: 401, error: 'Session invalid or expired.' }

  const { data: isAdmin, error: rpcErr } = await sb.rpc('is_manop_admin')
  if (rpcErr || isAdmin !== true) return { ok: false as const, status: 403, error: 'Admin access required.' }
  return { ok: true as const, user }
}