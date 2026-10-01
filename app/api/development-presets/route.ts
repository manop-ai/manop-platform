// app/api/development-presets/route.ts
//
// Read-only list of active Development Presets. No auth required —
// presets are reference data, same openness as site_appraisals'
// "try it" philosophy elsewhere in Site Studio.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export async function GET() {
  const { data, error } = await sb
    .from('development_presets')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ presets: data })
}