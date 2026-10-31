import test from 'node:test'
import assert from 'node:assert/strict'
import { makeSafeLock, type LockManagerLike } from '../lib/supabase/safe-lock'
import { fetchJson, withTimeout } from '../lib/fetch-json'

// A lock manager that grants immediately and serialises nothing (enough to prove pass-through).
const granting: LockManagerLike = { request: async (_n, _o, cb) => cb() }
// A lock manager whose lock is held forever by someone else: it only ever rejects when aborted.
const stuck: LockManagerLike = {
  request: (_n, o) => new Promise((_res, rej) => {
    o.signal?.addEventListener('abort', () => { const e: any = new Error('aborted'); e.name = 'AbortError'; rej(e) })
  }),
}

test('safe lock: runs the operation under the lock when it is granted', async () => {
  const lock = makeSafeLock(() => granting, 50)
  assert.equal(await lock('l', 0, async () => 'ok'), 'ok')
})
test('safe lock: a lock held forever does NOT freeze the caller; the operation runs unlocked after the wait', async () => {
  const lock = makeSafeLock(() => stuck, 30)
  const t0 = Date.now()
  assert.equal(await lock('l', 0, async () => 'ran'), 'ran')
  assert.ok(Date.now() - t0 < 1000)
})
test('safe lock: an error thrown BY the operation is rethrown, not retried', async () => {
  let calls = 0
  const lock = makeSafeLock(() => granting, 50)
  await assert.rejects(lock('l', 0, async () => { calls++; const e: any = new Error('boom'); e.name = 'AbortError'; throw e }), /boom/)
  assert.equal(calls, 1)
})
test('safe lock: no lock API (server, old browser) just runs the operation', async () => {
  const lock = makeSafeLock(() => undefined)
  assert.equal(await lock('l', 0, async () => 7), 7)
})

// ── fetchJson ──────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch
const stub = (impl: any) => { (globalThis as any).fetch = impl }
test.after(() => { (globalThis as any).fetch = realFetch })

test('fetchJson: success returns parsed data', async () => {
  stub(async () => new Response(JSON.stringify({ products: [1] }), { status: 200 }))
  const r = await fetchJson('/x')
  assert.equal(r.ok, true)
  assert.deepEqual(r.data, { products: [1] })
})
test('fetchJson: a JSON error body surfaces the server message', async () => {
  stub(async () => new Response(JSON.stringify({ error: 'column x does not exist' }), { status: 400 }))
  const r = await fetchJson('/x')
  assert.equal(r.ok, false)
  assert.equal(r.error, 'column x does not exist')
})
test('fetchJson: an HTML error page (Next 500) becomes a readable error, never a thrown SyntaxError', async () => {
  stub(async () => new Response('<html>Internal Server Error</html>', { status: 500 }))
  const r = await fetchJson('/x')
  assert.equal(r.ok, false)
  assert.match(r.error, /unexpected response \(HTTP 500\)/)
})
test('fetchJson: a request that never answers is cut off with a message', async () => {
  stub((_u: string, init: any) => new Promise((_res, rej) => {
    init.signal.addEventListener('abort', () => { const e: any = new Error('x'); e.name = 'AbortError'; rej(e) })
  }))
  const r = await fetchJson('/x', {}, 30)
  assert.equal(r.ok, false)
  assert.match(r.error, /No response from the server/)
})
test('fetchJson: a network failure is reported, not thrown', async () => {
  stub(async () => { throw new Error('connect ECONNREFUSED') })
  const r = await fetchJson('/x')
  assert.equal(r.ok, false)
  assert.match(r.error, /ECONNREFUSED/)
})
test('withTimeout: resolves with the fallback when the promise never settles or rejects', async () => {
  assert.equal(await withTimeout(new Promise(() => {}), 20, 'fb'), 'fb')
  assert.equal(await withTimeout(Promise.reject(new Error('x')), 20, 'fb'), 'fb')
  assert.equal(await withTimeout(Promise.resolve('v'), 20, 'fb'), 'v')
})
