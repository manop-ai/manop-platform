// lib/save-finance-analysis.ts
//
// Browser helper for POST /api/finance-analyses. Always settles with a result the UI can show; never throws, never
// reports success unless the server confirmed a saved row with an id. Attaches the signed-in user's token when there
// is one; the server decides ownership from it.

import { getAccessToken } from './authed-fetch'
import { fetchJson, withTimeout } from './fetch-json'

export interface SaveAnalysisResult {
  saved: boolean
  id: string | null
  reference: string | null
  owned: boolean          // true when the row was attached to the signed-in user
  error: string           // '' when saved
}

export async function saveFinanceAnalysis(payload: {
  analysis_type: 'buyer_affordability' | 'investment_intelligence' | 'payment_plan' | 'development_finance'
  property_id?: string | null
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
}): Promise<SaveAnalysisResult> {
  const token = await withTimeout(getAccessToken(), 8000, null)
  const r = await fetchJson('/api/finance-analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...payload, property_id: payload.property_id ?? null }),
  })
  if (r.ok && r.data?.saved && r.data?.id) {
    return { saved: true, id: r.data.id, reference: r.data.reference ?? null, owned: !!r.data.owned, error: '' }
  }
  return { saved: false, id: null, reference: null, owned: false, error: r.error || r.data?.error || 'The scenario could not be saved.' }
}