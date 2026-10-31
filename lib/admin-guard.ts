// lib/admin-guard.ts
//
// Route-handler guard for MANOP admin APIs. RLS (is_manop_admin()) is the real
// enforcement — every query below still runs as the caller via sbFromRequest — this
// just turns "RLS silently returned nothing" into a clear 401/403 for the UI.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from './supabase/route-client'

export async function requireAdmin(req: NextRequest) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) } as const
  const { data: isAdmin, error } = await sb.rpc('is_manop_admin')
  if (error || isAdmin !== true) return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) } as const
  return { sb, user } as const
}
/**
 * Entry point for staff-facing admin routes. TODAY every area needs a full MANOP admin (is_manop_admin()). It takes the AREA being used
 * ('agreements', 'fees', ...) so that when MANOP has employees, the check can become "this staff role may use this area" in ONE place
 * instead of in every route. Do not add per-route role logic elsewhere.
 */
export type StaffArea = 'agreements' | 'fees' | 'commercial' | 'mandate_letters' | 'developments'
export async function requireStaff(req: NextRequest, _area: StaffArea) {
  return requireAdmin(req)
}