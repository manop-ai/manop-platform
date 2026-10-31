// app/api/finance-analyses/route.ts
//
// POST  save a finance scenario. Anonymous visitors may save (the calculators are open); when a valid bearer
//       token is present the row is owned by THAT user. Ownership comes from the verified token, never from the
//       request body, so a caller cannot save a scenario as someone else.
// GET   the signed-in user's OWN saved scenarios (newest first). Identity again comes from the token: the browser
//       no longer filters by a userId it supplies.
//
// The privileged client (sbAdmin) is used only after the token is verified here. It makes the save independent of
// the table's insert/select RLS, which is where the previous direct browser insert could fail unseen. Every failure
// returns the real cause (describeSaveFailure) instead of a generic message, and is logged to the server terminal.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../lib/supabase/admin'
import { sbFromRequest } from '../../../lib/supabase/route-client'
import { validateAnalysisSave, describeSaveFailure } from '../../../lib/finance-analysis'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

async function callerId(req: NextRequest): Promise<{ id: string | null; invalidToken: boolean }> {
  if (!req.headers.get('authorization')) return { id: null, invalidToken: false }
  const { data: { user }, error } = await sbFromRequest(req).auth.getUser()
  if (error || !user) return { id: null, invalidToken: true }
  return { id: user.id, invalidToken: false }
}

export async function POST(req: NextRequest) {
  try {
    let body: any
    try { body = await req.json() } catch { return json({ saved: false, error: 'The request body is not valid JSON.' }, 400) }
    const v = validateAnalysisSave(body)
    if (!v.ok || !v.value) return json({ saved: false, error: v.errors.join(' ') }, 400)

    const who = await callerId(req)
    // A token that is present but invalid is refused, not quietly downgraded to an anonymous save the person
    // would then not find in their account.
    if (who.invalidToken) return json({ saved: false, error: 'Your session has expired. Sign in again to save this to your account.' }, 401)

    const { data, error } = await sbAdmin.from('finance_analyses').insert({
      analysis_type: v.value.analysis_type,
      property_id: v.value.property_id,
      user_id: who.id,
      inputs: v.value.inputs,
      outputs: v.value.outputs,
      input_provenance: v.value.input_provenance,
    }).select('id, reference').single()

    if (error) {
      console.error('POST /api/finance-analyses insert failed', { code: error.code, message: error.message, details: (error as any).details })
      return json({ saved: false, error: describeSaveFailure(error), code: error.code }, 500)
    }
    return json({ saved: true, id: data.id, reference: data.reference ?? null, owned: !!who.id }, 201)
  } catch (e: unknown) {
    console.error('POST /api/finance-analyses', e)
    return json({ saved: false, error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
}

export async function GET(req: NextRequest) {
  try {
    const who = await callerId(req)
    if (!who.id) return json({ error: 'Sign in to see your saved analyses.' }, 401)
    const { data, error } = await sbAdmin.from('finance_analyses')
      .select('id, reference, analysis_type, inputs, outputs, property_id, created_at')
      .eq('user_id', who.id).order('created_at', { ascending: false }).limit(50)
    if (error) {
      console.error('GET /api/finance-analyses failed', { code: error.code, message: error.message })
      return json({ error: describeSaveFailure(error), code: error.code }, 500)
    }
    return json({ analyses: data ?? [] })
  } catch (e: unknown) {
    console.error('GET /api/finance-analyses', e)
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
}