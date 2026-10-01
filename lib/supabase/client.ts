// lib/supabase/client.ts
//
// THE canonical browser Supabase client. Every 'use client' component
// should import { sb } from here — never call createClient() locally.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const sb = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'manop-auth',
  },
})