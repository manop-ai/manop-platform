// lib/supabase/client.ts
//
// THE canonical browser Supabase client. Every 'use client' component
// should import { sb } from here — never call createClient() locally.

import { createClient } from '@supabase/supabase-js'
import { browserSafeLock } from './safe-lock'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// `lock` replaces supabase-js's default wait-forever browser lock with one that gives up waiting
// (lib/supabase/safe-lock.ts). Passed through a loosely typed object so an older supabase-js that
// predates the option simply ignores it instead of failing the type check.
const auth: Record<string, unknown> = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storageKey: 'manop-auth',
  lock: browserSafeLock,
}

export const sb = createClient(url, key, { auth: auth as any })