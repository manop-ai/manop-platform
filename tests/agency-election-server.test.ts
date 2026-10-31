import test from 'node:test'
import assert from 'node:assert/strict'
import { activateElection, isMissingTable } from '../lib/agency-election-server'

// Minimal in-memory stand-in for the Supabase query builder, covering exactly the calls activateElection makes.
function fakeDb(rows: any[], failUpdateFor?: (patch: any, id: string) => boolean) {
  const q = (filters: [string, any][] = [], patch: any = null): any => ({
    eq: (k: string, v: any) => q([...filters, [k, v]], patch),
    select: () => q(filters, patch),
    maybeSingle: async () => ({ data: rows.find(r => filters.every(([k, v]) => r[k] === v)) ?? null, error: null }),
    then: (res: any) => {
      const hit = rows.filter(r => filters.every(([k, v]) => r[k] === v))
      const id = hit[0]?.id
      if (patch && failUpdateFor?.(patch, id)) return res({ error: { message: 'boom' } })
      if (patch) hit.forEach(r => Object.assign(r, patch))
      return res({ error: null })
    },
  })
  return { from: () => ({ select: () => q(), update: (patch: any) => q([], patch) }) }
}

const A = 'agency-1'
const mk = (o: any) => ({ agency_id: A, effective_to: null, ended_reason: null, ...o })

test('activating a new route ends the old one the day before and links them', async () => {
  const rows = [mk({ id: 'old', model: 'success_fee', status: 'active', effective_from: '2026-01-01' }), mk({ id: 'new', model: 'subscription', status: 'proposed', effective_from: null })]
  const r = await activateElection(fakeDb(rows) as any, rows[1], '2026-11-01', 'admin-1', 'switch')
  assert.equal(r.ok, true)
  assert.equal(rows[0].status, 'ended'); assert.equal(rows[0].effective_to, '2026-10-31'); assert.equal(rows[0].ended_reason, 'switch')
  assert.equal(rows[1].status, 'active'); assert.equal(rows[1].effective_from, '2026-11-01'); assert.equal(rows[1].supersedes_id, 'old')
})

test('a failed activation restores the old route so the agency is never left without one', async () => {
  const rows = [mk({ id: 'old', model: 'success_fee', status: 'active', effective_from: '2026-01-01' }), mk({ id: 'new', model: 'subscription', status: 'proposed' })]
  const r = await activateElection(fakeDb(rows, (patch) => patch.status === 'active' && patch.activated_by) as any, rows[1], '2026-11-01', 'admin-1', 'switch')
  assert.equal(r.ok, false)
  assert.equal(rows[0].status, 'active'); assert.equal(rows[0].effective_to, null)
  assert.equal(rows[1].status, 'proposed')
})

test('a new route cannot start before the current route began', async () => {
  const rows = [mk({ id: 'old', model: 'success_fee', status: 'active', effective_from: '2026-06-01' }), mk({ id: 'new', model: 'subscription', status: 'proposed' })]
  const r = await activateElection(fakeDb(rows) as any, rows[1], '2026-05-01', 'admin-1', 'x')
  assert.equal(r.ok, false); assert.equal(rows[0].status, 'active')
})

test('activating with no current route just activates', async () => {
  const rows = [mk({ id: 'new', model: 'success_fee', status: 'proposed' })]
  assert.equal((await activateElection(fakeDb(rows) as any, rows[0], '2026-10-22', 'a', 'x')).ok, true)
  assert.equal(rows[0].status, 'active')
})

test('missing-table errors are recognised so the existing subscription flow keeps working', () => {
  assert.equal(isMissingTable({ code: '42P01' }), true)
  assert.equal(isMissingTable({ code: 'PGRST205', message: 'x' }), true)
  assert.equal(isMissingTable({ message: 'relation "agency_commercial_elections" does not exist' }), true)
  assert.equal(isMissingTable({ code: '23505', message: 'duplicate' }), false)
  assert.equal(isMissingTable(null), false)
})
