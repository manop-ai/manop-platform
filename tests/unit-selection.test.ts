import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describeUnit, buildSnapshot, validateUnitRequest, resolveRouting, summariseUnitRequest, priceLine,
  PRICE_STALE_DAYS, type UnitRow,
} from '../lib/unit-selection'

const NOW = new Date('2026-10-18T09:00:00Z')
const recent = '2026-09-20T00:00:00Z'

// The Lavender's recorded schedule, as supplied. Rows are deliberately NOT in price order.
const LAVENDER: UnitRow[] = [
  { id: 'u-pent', unit_type: '4-bedroom penthouse maisonette', price_ngn: 1_500_000_000, currency_code: 'NGN', available_count: 1, last_price_verified_at: recent },
  { id: 'u-1bed', unit_type: '1-bedroom apartment', price_ngn: 330_000_000, currency_code: 'NGN', available_count: 6, last_price_verified_at: recent },
  { id: 'u-mais', unit_type: '4-bedroom maisonette', price_ngn: 850_000_000, currency_code: 'NGN', available_count: null, last_price_verified_at: null },
  { id: 'u-2bed', unit_type: '2-bedroom apartment', price_ngn: 500_000_000, currency_code: 'NGN', available_count: 3, last_price_verified_at: '2026-01-01T00:00:00Z' },
]

const pick = (id: string, purpose: string | null = 'explore_financing') =>
  validateUnitRequest({ units: LAVENDER, unitTypeId: id, purpose, now: NOW })

type Good = Extract<ReturnType<typeof pick>, { ok: true }>
function ok(r: ReturnType<typeof pick>): Good {
  assert.equal(r.ok, true, 'error' in r ? r.error : '')
  return r as Good
}

// ── Tests A–D: each unit carries its own price ─────────────────────────────
test('A: 1-bedroom is associated with ₦330,000,000', () => {
  const r = ok(pick('u-1bed'))
  assert.equal(r.snapshot!.unit_type_label, '1-bedroom apartment')
  assert.equal(r.snapshot!.unit_price_ngn, 330_000_000)
  assert.equal(r.snapshot!.unit_type_id, 'u-1bed')
})
test('B: 2-bedroom is ₦500,000,000, not ₦330,000,000', () => {
  const r = ok(pick('u-2bed'))
  assert.equal(r.snapshot!.unit_price_ngn, 500_000_000)
  assert.notEqual(r.snapshot!.unit_price_ngn, 330_000_000)
})
test('C: maisonette is ₦850,000,000', () => {
  assert.equal(ok(pick('u-mais')).snapshot!.unit_price_ngn, 850_000_000)
})
test('D: penthouse is ₦1,500,000,000', () => {
  assert.equal(ok(pick('u-pent')).snapshot!.unit_price_ngn, 1_500_000_000)
})
test('row order never decides the unit: each id resolves to its own price wherever it sits', () => {
  for (const u of LAVENDER) assert.equal(ok(pick(u.id)).snapshot!.unit_price_ngn, u.price_ngn)
})

// ── Test E: missing price is never substituted ─────────────────────────────
test('E: a unit with no price stays unpriced; no other unit’s price leaks in', () => {
  const units = [...LAVENDER, { id: 'u-none', unit_type: '3-bedroom', price_ngn: null, currency_code: 'NGN' }]
  const v = describeUnit(units[4], NOW)
  assert.equal(v.priceNgn, null)
  assert.equal(v.priceStatus, 'not_supplied')
  assert.equal(priceLine(v), 'Price not supplied')
  assert.equal(v.canAssessFinancing, false)
  const r = validateUnitRequest({ units, unitTypeId: 'u-none', purpose: 'confirm_price_availability', now: NOW })
  assert.equal(r.ok, true)
  if ('snapshot' in r) { assert.equal(r.snapshot!.unit_price_ngn, null); assert.equal(r.snapshot!.unit_price_status, 'not_supplied') }
})
test('E: zero or negative prices are treated as not supplied, not as ₦0', () => {
  assert.equal(describeUnit({ id: 'x', unit_type: 'a', price_ngn: 0 }, NOW).priceStatus, 'not_supplied')
  assert.equal(describeUnit({ id: 'x', unit_type: 'a', price_ngn: -5 }, NOW).priceNgn, null)
  assert.equal(describeUnit({ id: 'x', unit_type: 'a', price_ngn: '' }, NOW).priceNgn, null)
})
test('financing cannot be requested for an unpriced unit, but a price confirmation can', () => {
  const units: UnitRow[] = [{ id: 'u1', unit_type: 'Studio', price_ngn: null }]
  assert.equal(validateUnitRequest({ units, unitTypeId: 'u1', purpose: 'explore_financing', now: NOW }).ok, false)
  assert.equal(validateUnitRequest({ units, unitTypeId: 'u1', purpose: 'financing_and_price', now: NOW }).ok, false)
  assert.equal(validateUnitRequest({ units, unitTypeId: 'u1', purpose: 'confirm_price_availability', now: NOW }).ok, true)
})

// ── Selection is explicit, never defaulted ─────────────────────────────────
test('a purpose without a chosen unit is refused (no silent first-unit default)', () => {
  const r = validateUnitRequest({ units: LAVENDER, unitTypeId: null, purpose: 'explore_financing', now: NOW })
  assert.equal(r.ok, false)
})
test('a plain enquiry may carry no unit at all', () => {
  const r = validateUnitRequest({ units: LAVENDER, unitTypeId: null, purpose: null, now: NOW })
  assert.equal(r.ok, true)
  if ('snapshot' in r) assert.equal(r.snapshot, null)
})
test('a unit from another development is refused', () => {
  const r = validateUnitRequest({ units: LAVENDER, unitTypeId: 'someone-elses-unit', purpose: 'explore_financing', now: NOW })
  assert.equal(r.ok, false)
})
test('unknown purpose or financing type is refused', () => {
  assert.equal(validateUnitRequest({ units: LAVENDER, unitTypeId: 'u-1bed', purpose: 'free_money', now: NOW }).ok, false)
  assert.equal(validateUnitRequest({ units: LAVENDER, unitTypeId: 'u-1bed', purpose: 'explore_financing', financingType: 'crypto', now: NOW }).ok, false)
})

// ── Price integrity ────────────────────────────────────────────────────────
test('price status reflects confirmation, and only a recent one is not flagged', () => {
  assert.equal(describeUnit(LAVENDER[1], NOW).priceStatus, 'recently_confirmed')
  assert.equal(describeUnit(LAVENDER[1], NOW).requiresConfirmation, false)
  assert.equal(describeUnit(LAVENDER[2], NOW).priceStatus, 'no_confirmation_date')
  assert.equal(describeUnit(LAVENDER[2], NOW).requiresConfirmation, true)
  assert.equal(describeUnit(LAVENDER[3], NOW).priceStatus, 'not_recently_confirmed')
  assert.equal(describeUnit(LAVENDER[3], NOW).requiresConfirmation, true)
})
test(`the staleness window is ${PRICE_STALE_DAYS} days`, () => {
  const mk = (d: number) => describeUnit({ id: 'x', unit_type: 'a', price_ngn: 1, last_price_verified_at: new Date(NOW.getTime() - d * 86_400_000).toISOString() }, NOW).priceStatus
  assert.equal(mk(PRICE_STALE_DAYS), 'recently_confirmed')
  assert.equal(mk(PRICE_STALE_DAYS + 1), 'not_recently_confirmed')
})
test('a non-NGN recorded currency is not presented as naira', () => {
  const v = describeUnit({ id: 'x', unit_type: 'a', price_ngn: 500000, currency_code: 'USD', last_price_verified_at: recent }, NOW)
  assert.equal(v.priceStatus, 'currency_unconfirmed')
  assert.equal(v.priceNgn, null)
  assert.equal(v.canAssessFinancing, false)
})
test('unknown availability is never described as available', () => {
  const v = describeUnit(LAVENDER[2], NOW)
  assert.equal(v.availableCount, null)
  assert.match(v.availabilityNote, /not confirmed/i)
  assert.doesNotMatch(v.availabilityNote, /^\d+ recorded as available/)
  assert.match(describeUnit({ id: 'x', unit_type: 'a', available_count: 0 }, NOW).availabilityNote, /None recorded/)
})
test('a snapshot is a copy: editing the listing afterwards does not change it', () => {
  const row: UnitRow = { id: 'x', unit_type: '1-bedroom apartment', price_ngn: 330_000_000, last_price_verified_at: recent }
  const snap = buildSnapshot(describeUnit(row, NOW), NOW)
  row.price_ngn = 999_000_000
  assert.equal(snap.unit_price_ngn, 330_000_000)
  assert.equal(snap.unit_snapshot_at, NOW.toISOString())
})

// ── Persistence view (Test F, display side) ────────────────────────────────
test('F: a stored snapshot reads back as the same unit and price', () => {
  const r = ok(pick('u-2bed', 'financing_and_price'))
  const stored = { ...r.snapshot!, request_purpose: r.purpose, financing_type: 'developer_plan', routing_status: 'manop_operator' }
  const s = summariseUnitRequest(stored)
  assert.equal(s.recorded, true)
  assert.equal(s.unitLabel, '2-bedroom apartment')
  assert.equal(s.priceLine, '₦500,000,000')
  assert.match(s.purposeLabel!, /Financing information and price/)
  assert.match(s.priceNote, /requires confirmation/)
  assert.match(s.routingLabel!, /MANOP operator/)
})
test('F: legacy leads do not present their auto-filled unit id as the buyer’s choice', () => {
  const s = summariseUnitRequest({ unit_type_id: 'first-unit-uuid', unit_type_label: null })
  assert.equal(s.recorded, false)
  assert.equal(s.unitLabel, 'No unit selection recorded')
  assert.match(s.note!, /not the buyer/)
  assert.doesNotMatch(JSON.stringify(s), /first-unit-uuid/)
})

// ── Test G: routing ────────────────────────────────────────────────────────
test('G: unclaimed development with no agency mandate goes to the MANOP operator queue', () => {
  assert.equal(resolveRouting({ developerClaimed: false, submittingAgencyId: null, mandateOnFile: false }), 'manop_operator')
})
test('G: an agency with no mandate on file does not receive it; it stays with MANOP', () => {
  assert.equal(resolveRouting({ developerClaimed: false, submittingAgencyId: 'ag1', mandateOnFile: false }), 'manop_operator')
})
test('G: a mandated agency receives it when no developer has claimed the account', () => {
  assert.equal(resolveRouting({ developerClaimed: false, submittingAgencyId: 'ag1', mandateOnFile: true }), 'agency_mandate')
})
test('G: a claimed developer account receives it, even where an agency submitted the listing', () => {
  assert.equal(resolveRouting({ developerClaimed: true, submittingAgencyId: 'ag1', mandateOnFile: true }), 'developer_account')
})

// ── No commercial side effects ─────────────────────────────────────────────
test('the snapshot carries no fee, commission or agreement field', () => {
  const keys = Object.keys(ok(pick('u-1bed')).snapshot!).join(' ')
  assert.doesNotMatch(keys, /fee|commission|agreement|responsible|stage/i)
})
