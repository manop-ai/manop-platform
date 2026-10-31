// app/api/finance-products/route.ts
//
// PHASE 8 / 17 — public read for Finance Suitability matching. Open to anyone (no login wall), same posture as Buyer
// Affordability. RLS on finance_products restricts what a non-admin can read to status='active' rows.
//
// This route chooses its COLUMNS explicitly: RLS filters rows, not columns, and the register now holds MANOP-internal
// fields (internal_notes, follow_up_owner, next_follow_up_at) that a buyer must never receive.
//
//   GET /api/finance-products?country_code=NG&city=Lekki&product_type=mortgage
//     -> the raw list of active products (public columns only).
//   GET /api/finance-products?...&ltv_pct=65&monthly_income_ngn=800000&loan_tenor_years=15&loan_amount_ngn=...
//        &deposit_pct=...&residency=resident&employment=salaried&income_currency=NGN
//     -> each product run through lib/finance-products.ts, returned with a verdict, per-criterion checks and reasons.
//   A product that is stale, awaiting confirmation or unsourced comes back with verdict 'stale' / 'confirmation_required'
//   and is never presented as a match. A match is not a lender decision.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../lib/supabase/route-client'
import {
  matchFinanceProducts, isMissingColumnError, PUBLIC_PRODUCT_COLUMNS_EXTENDED, PUBLIC_PRODUCT_COLUMNS_LEGACY,
  type FinanceProduct, type SuitabilityCriteria,
} from '../../../lib/finance-products'

const NUMERIC_PARAMS = ['ltv_pct', 'monthly_income_ngn', 'loan_tenor_years', 'loan_amount_ngn', 'deposit_pct'] as const

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const countryCode = (sp.get('country_code') || 'NG').toUpperCase()
    const city = sp.get('city')
    const productType = sp.get('product_type') as SuitabilityCriteria['product_type']

    const nums: Record<string, number | null> = {}
    for (const k of NUMERIC_PARAMS) {
      if (!sp.has(k) || sp.get(k) === '') { nums[k] = null; continue }
      const n = Number(sp.get(k))
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `${k} must be a non-negative number.` }, { status: 400 })
      nums[k] = n
    }

    const sb = sbFromRequest(req)
    const build = (cols: string) => {
      let q = sb.from('finance_products').select(cols).eq('status', 'active').eq('country_code', countryCode)
      if (productType) q = q.eq('product_type', productType)
      return q
    }
    let { data, error } = await build(PUBLIC_PRODUCT_COLUMNS_EXTENDED)
    if (error && isMissingColumnError(error)) ({ data, error } = await build(PUBLIC_PRODUCT_COLUMNS_LEGACY))   // phase 17 not applied yet
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const products = (data ?? []) as unknown as FinanceProduct[]
    const hasCriteria = NUMERIC_PARAMS.some(k => nums[k] != null) || ['residency', 'employment', 'income_currency'].some(k => sp.get(k))
    if (!hasCriteria) return NextResponse.json({ products })

    const criteria: SuitabilityCriteria = {
      country_code: countryCode,
      city: city || null,
      product_type: productType || null,
      ltv_pct: nums.ltv_pct, monthly_income_ngn: nums.monthly_income_ngn, loan_tenor_years: nums.loan_tenor_years,
      loan_amount_ngn: nums.loan_amount_ngn, deposit_pct: nums.deposit_pct,
      residency: sp.get('residency') || null, employment: sp.get('employment') || null, income_currency: sp.get('income_currency') || null,
    }
    return NextResponse.json({ matches: matchFinanceProducts(products, criteria) })
  } catch (e: unknown) {
    console.error('GET /api/finance-products', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
