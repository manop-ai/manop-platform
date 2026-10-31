import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanDraft, cleanUnits, validateSubmit, nextStatus, canEditProject } from '../lib/developer-project'

const ok = <T,>(r: { ok: boolean } & Record<string, any>): T => { assert.equal(r.ok, true, r.error); return r.value }

test('a draft needs only a name and a location', () => {
  const d = ok<any>(cleanDraft({ name: ' The Lavender ', neighborhood: ' Lekki Phase 1 ' }))
  assert.equal(d.name, 'The Lavender')
  assert.equal(d.location, 'Lekki Phase 1')
  assert.equal(d.total_units, null)
  assert.equal(d.stage, 'Foundation')
  assert.equal(d.country_code, 'NG')
})
test('missing name or location is refused with a clear message (the bug in the screenshot)', () => {
  assert.match((cleanDraft({ name: '', neighborhood: 'Lekki' }) as any).error, /name is required/i)
  assert.match((cleanDraft({ name: 'X', neighborhood: '' }) as any).error, /Location is required/)
})
test('location string joins neighbourhood and city', () => {
  assert.equal(ok<any>(cleanDraft({ name: 'X', neighborhood: 'Ikoyi', city: 'Lagos' })).location, 'Ikoyi, Lagos')
})
test('total units is optional (land) but must be a whole number >= 1 when given', () => {
  assert.equal(ok<any>(cleanDraft({ name: 'X', neighborhood: 'Y', total_units: '' })).total_units, null)
  assert.equal(ok<any>(cleanDraft({ name: 'X', neighborhood: 'Y', total_units: '24' })).total_units, 24)
  for (const bad of ['0', '-3', '2.5', 'abc']) assert.equal(cleanDraft({ name: 'X', neighborhood: 'Y', total_units: bad }).ok, false, bad)
})
test('an unknown stage falls back rather than reaching the database', () => {
  assert.equal(ok<any>(cleanDraft({ name: 'X', neighborhood: 'Y', stage: 'Published' })).stage, 'Foundation')
})
test('submission needs a city and something for MANOP to review', () => {
  const d = ok<any>(cleanDraft({ name: 'X', neighborhood: 'Y', city: '' }))
  assert.match(validateSubmit(d, 3)!, /City/)
  const d2 = ok<any>(cleanDraft({ name: 'X', neighborhood: 'Y', city: 'Lagos' }))
  assert.match(validateSubmit(d2, 0)!, /description or at least one unit/)
  assert.equal(validateSubmit(d2, 1), null)
  const d3 = ok<any>(cleanDraft({ name: 'X', neighborhood: 'Y', city: 'Lagos', description: 'Mixed-use block' }))
  assert.equal(validateSubmit(d3, 0), null)
})
test('unit prices are optional and an empty price is null, never 0', () => {
  const u = ok<any[]>(cleanUnits([{ unit_type: '1-bedroom apartment', price_ngn: '' }, { unit_type: '  ' }, { unit_type: '2-bedroom', price_ngn: '500000000' }]))
  assert.equal(u.length, 2)
  assert.equal(u[0].price_ngn, null)
  assert.equal(u[1].price_ngn, 500_000_000)
})
test('a zero or negative price is refused, not stored', () => {
  assert.equal(cleanUnits([{ unit_type: 'a', price_ngn: '0' }]).ok, false)
  assert.equal(cleanUnits([{ unit_type: 'a', price_ngn: '-5' }]).ok, false)
})
test('deposit must be 0-100', () => {
  assert.equal(cleanUnits([{ unit_type: 'a', deposit_pct: '120' }]).ok, false)
})
test('developer can only save a draft or submit for review; never publish', () => {
  assert.deepEqual(nextStatus('save', null), { ok: true, status: 'draft' })
  assert.deepEqual(nextStatus('submit', null), { ok: true, status: 'pending_review' })
  assert.deepEqual(nextStatus('submit', 'draft'), { ok: true, status: 'pending_review' })
  for (const a of ['save', 'submit'] as const) for (const status of ['pending_review', 'published', 'rejected']) {
    assert.equal(nextStatus(a, status).ok, false, `${a} on ${status}`)
  }
  for (const a of ['save', 'submit'] as const) {
    const r = nextStatus(a, 'draft'); assert.ok(r.ok && r.status !== ('published' as string))
  }
})
test('only drafts are editable from the developer dashboard', () => {
  assert.equal(canEditProject('draft'), true)
  for (const s of ['pending_review', 'published', 'rejected', null, undefined, '']) assert.equal(canEditProject(s as any), false)
})
