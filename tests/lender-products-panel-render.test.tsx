import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as any).React = React
import LenderProductsPanel from '../components/LenderProductsPanel'
import type { FinanceProduct } from '../lib/finance-products'

const now = Date.now()
const iso = (d: number) => new Date(now - d * 86400000).toISOString()
const base: FinanceProduct = {
  id: 'a', lender_name: 'FirstBank', product_name: 'MREIF Home Loan', product_type: 'mortgage', country_code: 'NG', cities_covered: [],
  min_rate_pct: 9.75, max_rate_pct: 9.75, max_ltv_pct: null, min_tenor_years: null, max_tenor_years: 20, min_monthly_income_ngn: null,
  eligibility_notes: null, source_name: 'FirstBank page', source_url: 'https://example.com', last_verified_at: iso(5), status: 'active',
  created_at: iso(5), updated_at: iso(5), coverage_scope: 'nationwide', verification_status: 'researched_public',
}
const render = (products: FinanceProduct[], extra: any = {}) =>
  renderToStaticMarkup(<LenderProductsPanel products={products} loadState="idle" loadError="" reload={async () => {}} getToken={async () => 't'} {...extra} />)

test('panel: shows the evidence class, missing criteria and eligibility for buyer comparison', () => {
  const html = render([base])
  assert.match(html, /Researched from a public source/)
  assert.match(html, /Missing: .*Maximum LTV/)
  assert.match(html, /Included \(provider has not confirmed\)/)
})
test('panel: a stale product is excluded and says why; an invalid date is flagged not silently current', () => {
  assert.match(render([{ ...base, last_verified_at: iso(400) }]), /Excluded: Last verified more than 180 days ago/)
  const bad = render([{ ...base, last_verified_at: 'garbage' }])
  assert.match(bad, /Excluded: Verification date missing or invalid/)
  assert.match(bad, /Date missing or invalid/)
})
test('panel: awaiting-confirmation and withdrawn products are not offered to buyers', () => {
  assert.match(render([{ ...base, verification_status: 'awaiting_confirmation' }]), /Excluded: Awaiting confirmation/)
  assert.match(render([{ ...base, status: 'withdrawn' }]), /Withdrawn/)
})
test('panel: never describes a product as approved or eligible-for-you language', () => {
  assert.doesNotMatch(render([base]), /approved|pre-?qualified/i)
})
test('panel: a load failure is shown with its reason, not an empty table', () => {
  const html = render([], { loadState: 'error', loadError: 'Admin access required.' })
  assert.match(html, /Couldn(&#x27;|')t load lender products\. Admin access required\./)
})
test('panel: the form asks for a source and verification date and explains blank = not recorded', () => {
  const html = render([])
  assert.match(html, /Source \*/); assert.match(html, /Date MANOP checked it \*/); assert.match(html, /not recorded/)
  assert.match(html, /Internal \(never shown to buyers\)/)
})
