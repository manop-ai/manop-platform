// Renders the real FinancingModal to static HTML (react-dom/server) with The Lavender's recorded units.
// Static render shows the first step only; the click flow and submission are NOT exercised here.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-anon-key'
import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as any).React = React   // components use Next's automatic JSX; tsx needs React in scope

const recent = new Date(Date.now() - 5 * 86_400_000).toISOString()
const UNITS = [
  { id: 'u1', unit_type: '1-bedroom apartment', price_ngn: 330_000_000, currency_code: 'NGN', available_count: 6, last_price_verified_at: recent },
  { id: 'u2', unit_type: '2-bedroom apartment', price_ngn: 500_000_000, currency_code: 'NGN', available_count: null, last_price_verified_at: null },
  { id: 'u3', unit_type: '4-bedroom maisonette', price_ngn: 850_000_000, currency_code: 'NGN' },
  { id: 'u4', unit_type: '4-bedroom penthouse maisonette', price_ngn: 1_500_000_000, currency_code: 'NGN' },
]

test('the modal opens on unit selection and lists every unit with its own price, none preselected', async () => {
  const { default: FinancingModal } = await import('../components/FinancingModal')
  const html = renderToStaticMarkup(<FinancingModal projectId="p1" units={UNITS} propertyAddress="The Lavender" onClose={() => {}} dark />)
  assert.match(html, /Which unit are you asking about\?/)
  for (const [label, price] of [['1-bedroom apartment', '₦330,000,000'], ['2-bedroom apartment', '₦500,000,000'], ['4-bedroom maisonette', '₦850,000,000'], ['4-bedroom penthouse maisonette', '₦1,500,000,000']]) {
    assert.ok(html.includes(label), label)
    assert.ok(html.includes(price), price)
  }
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 0, 'nothing is preselected for a multi-unit development')
  assert.match(html, /Explore financing options/)
  assert.match(html, /Confirm price and availability/)
  assert.match(html, /requires confirmation/)
  assert.match(html, /Availability not confirmed/)
  assert.doesNotMatch(html, /Property Value/)
})

test('a unit with no price shows "Price not supplied", never another unit’s price', async () => {
  const { default: FinancingModal } = await import('../components/FinancingModal')
  const html = renderToStaticMarkup(<FinancingModal projectId="p1" units={[{ id: 'a', unit_type: 'Studio', price_ngn: null }, { id: 'b', unit_type: '1-bedroom', price_ngn: 330_000_000 }]} onClose={() => {}} dark />)
  assert.match(html, /Studio[\s\S]*?Price not supplied/)
})

test('a development with a single unit pre-selects it explicitly', async () => {
  const { default: FinancingModal } = await import('../components/FinancingModal')
  const html = renderToStaticMarkup(<FinancingModal projectId="p1" units={[UNITS[1]]} onClose={() => {}} dark />)
  assert.equal((html.match(/role="radio" aria-checked="true"/g) || []).length, 1)
})

test('Deal Room unit card shows the unit, the price recorded at request time, purpose and routing; legacy rows show no unit', async () => {
  const { default: UnitRequestSummary } = await import('../components/UnitRequestSummary')
  const html = renderToStaticMarkup(<UnitRequestSummary dark lead={{
    unit_type_label: '4-bedroom maisonette', unit_price_ngn: 850_000_000, unit_price_status: 'no_confirmation_date',
    unit_available_count: null, unit_snapshot_at: '2026-10-18T10:00:00Z', request_purpose: 'confirm_price_availability', routing_status: 'manop_operator',
  }} />)
  assert.match(html, /4-bedroom maisonette/)
  assert.match(html, /₦850,000,000/)
  assert.match(html, /requires confirmation/)
  assert.match(html, /Confirm price and availability/)
  assert.match(html, /MANOP operator queue/)
  assert.match(html, /not an offer/)
  const legacy = renderToStaticMarkup(<UnitRequestSummary dark lead={{ unit_type_id: 'auto-filled-first-unit' }} />)
  assert.match(legacy, /No unit selection recorded/)
  assert.doesNotMatch(legacy, /auto-filled-first-unit/)
})

test('developer New project form renders the location field the old inline form was missing', async () => {
  const { default: DeveloperProjectForm } = await import('../components/DeveloperProjectForm')
  const html = renderToStaticMarkup(<DeveloperProjectForm dark onDone={() => {}} />)
  assert.match(html, /Development name \*/)
  assert.match(html, /Location \(neighbourhood or area\) \*/)
  assert.match(html, /Total units/)
  assert.match(html, /Save draft/)
  assert.match(html, /Submit for MANOP review/)
  assert.doesNotMatch(html, /Publish now|>Publish</)
})
