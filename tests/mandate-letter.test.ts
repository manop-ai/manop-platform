import test from 'node:test'
import assert from 'node:assert/strict'
import { validateUpload, sniffType, sameKind, publicIdFor, publicIdBelongsTo, decideLetterAccess, planAdminAction, ownerView, MAX_BYTES, cleanFilename } from '../lib/mandate-letter'
import { cloudConfig, signedUploadFor, verifyUploadedAsset, openUrlFor, readHead } from '../lib/mandate-letter-server'

const AG = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222', LID = '33333333-3333-3333-3333-333333333333'
const cfg = { cloud: 'demo', apiKey: 'KEY', apiSecret: 'SECRET' }
const L = (o: any = {}) => ({ status: 'uploaded', visibility: 'internal', agency_id: AG, project_id: null, ...o })

test('upload validation: type, size, empty', () => {
  assert.equal(validateUpload({ filename: 'letter.pdf', bytes: 1000 }).ok, true)
  assert.equal(validateUpload({ filename: 'letter.exe', bytes: 1000 }).ok, false)
  assert.equal(validateUpload({ filename: 'letter.pdf.exe', bytes: 1000 }).ok, false)
  assert.equal(validateUpload({ filename: 'letter', bytes: 1000 }).ok, false)
  assert.equal(validateUpload({ filename: 'a.png', bytes: MAX_BYTES + 1 }).ok, false)
  assert.equal(validateUpload({ filename: 'a.png', bytes: 0 }).ok, false)
  assert.equal(validateUpload({ filename: '', bytes: 5 }).ok, false)
  assert.equal(cleanFilename('../../etc/passwd'), '.._.._etc_passwd')
})

test('file kind comes from the first bytes, not from the name or browser type', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n'), exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3]), png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  assert.equal(sniffType(pdf), 'pdf'); assert.equal(sniffType(png), 'png'); assert.equal(sniffType(jpg), 'jpg'); assert.equal(sniffType(exe), null)
  assert.equal(sameKind('pdf', sniffType(exe)), false)             // an .exe renamed to .pdf
  assert.equal(sameKind('pdf', sniffType(png)), false)
  assert.equal(sameKind('jpeg', sniffType(jpg)), true)
})

test('storage path is server-generated and bound to agency and letter', () => {
  const id = publicIdFor(AG, LID, 'pdf'); assert.equal(id, `mandate-letters/${AG}/${LID}.pdf`)
  assert.equal(publicIdBelongsTo(id, AG, LID), true)
  assert.equal(publicIdBelongsTo(id, OTHER, LID), false)
  assert.equal(publicIdBelongsTo('mandate-letters/../x.pdf', AG, LID), false)
})

test('access: default internal means the public is refused; owner and admin allowed; other agency refused', () => {
  const internal = L({ status: 'approved' })
  assert.equal(decideLetterAccess(internal as any, { isAdmin: false, agencyId: null }, { parentPublished: true }).allowed, false)
  assert.equal(decideLetterAccess(internal as any, { isAdmin: false, agencyId: OTHER }, { parentPublished: true }).allowed, false)
  assert.equal(decideLetterAccess(internal as any, { isAdmin: false, agencyId: AG }, { parentPublished: false }).via, 'owner')
  assert.equal(decideLetterAccess(internal as any, { isAdmin: true, agencyId: null }, { parentPublished: false }).via, 'admin')
})

test('public access needs explicit public visibility, an accepted letter, and a published development', () => {
  const pub = L({ status: 'approved', visibility: 'public', project_id: 'p' })
  const anon = { isAdmin: false, agencyId: null }
  assert.equal(decideLetterAccess(pub as any, anon, { parentPublished: true }).via, 'public')
  assert.equal(decideLetterAccess(pub as any, anon, { parentPublished: false }).allowed, false)
  assert.equal(decideLetterAccess({ ...pub, status: 'under_review' } as any, anon, { parentPublished: true }).allowed, false)
  assert.equal(decideLetterAccess({ ...pub, visibility: 'internal' } as any, anon, { parentPublished: true }).allowed, false)   // withdrawn
  assert.equal(decideLetterAccess({ ...pub, status: 'removed' } as any, { isAdmin: true, agencyId: null }, { parentPublished: true }).allowed, false)
})

test('approving never makes a letter public; visibility is a separate recorded decision', () => {
  const a = planAdminAction(L(), { action: 'approve' }); assert.ok(a.ok); assert.equal(a.patch!.visibility, undefined); assert.equal(a.patch!.status, 'approved')
  assert.equal(planAdminAction(L({ status: 'uploaded' }), { action: 'set_visibility', visibility: 'public', note: 'ok to show' }).ok, false)   // not accepted yet
  assert.equal(planAdminAction(L({ status: 'approved' }), { action: 'set_visibility', visibility: 'public' }).ok, false)                     // no reason
  const p = planAdminAction(L({ status: 'approved' }), { action: 'set_visibility', visibility: 'public', note: 'Owner agreed to show it' }); assert.ok(p.ok); assert.equal(p.event, 'made_public'); assert.equal(p.patch!.status, undefined)
  const w = planAdminAction(L({ status: 'approved', visibility: 'public' }), { action: 'set_visibility', visibility: 'internal', note: 'Owner withdrew consent' }); assert.ok(w.ok); assert.equal(w.event, 'made_internal')
  assert.equal(planAdminAction(L({ status: 'approved', visibility: 'internal' }), { action: 'set_visibility', visibility: 'internal', note: 'again please' }).ok, false)
})

test('rejecting or asking for changes needs a reason and forces visibility back to internal', () => {
  assert.equal(planAdminAction(L(), { action: 'reject' }).ok, false)
  const r = planAdminAction(L({ status: 'approved', visibility: 'public' }), { action: 'request_changes', note: 'Signature is missing' }); assert.ok(r.ok); assert.equal(r.patch!.visibility, 'internal')
  const rm = planAdminAction(L({ status: 'approved', visibility: 'public' }), { action: 'remove', note: 'Uploaded in error' }); assert.ok(rm.ok); assert.equal(rm.patch!.visibility, 'internal')
  assert.equal(planAdminAction(L({ status: 'superseded' }), { action: 'approve' }).ok, false)
})

test('agencies see their status and the reason for a request, never storage details', () => {
  const v = ownerView({ id: 'x', status: 'changes_requested', review_note: 'Signature missing', cloudinary_public_id: 'mandate-letters/secret', original_filename: 'a.pdf', bytes: 10, format: 'pdf', uploaded_at: 't', version: 2 })
  assert.equal(v.reviewNote, 'Signature missing'); assert.doesNotMatch(JSON.stringify(v), /mandate-letters|cloudinary/i)
  assert.equal(ownerView({ id: 'x', status: 'approved', review_note: 'internal remark' }).reviewNote, null)
})

test('signed upload is private (authenticated), signed with the server secret, and carries no secret', () => {
  const s = signedUploadFor(cfg, `mandate-letters/${AG}/${LID}.pdf`, 1_700_000_000_000)
  assert.equal(s.fields.type, 'authenticated'); assert.equal(s.fields.overwrite, 'false'); assert.match(s.uploadUrl, /\/raw\/upload$/)
  assert.ok(s.fields.signature && s.fields.signature.length === 40); assert.doesNotMatch(JSON.stringify(s), /SECRET/)
  assert.equal(cloudConfig({}), null); assert.ok(cloudConfig({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }))
})

test('open links are short-lived and signed; public links are shorter', () => {
  const a = openUrlFor(cfg, 'mandate-letters/x/y.pdf', 'admin'), p = openUrlFor(cfg, 'mandate-letters/x/y.pdf', 'public')
  assert.equal(a.expiresInSeconds, 300); assert.equal(p.expiresInSeconds, 60)
  assert.match(a.url, /signature=/); assert.match(a.url, /expires_at=/); assert.doesNotMatch(a.url, /SECRET/)
})

// A scripted stand-in for Cloudinary
function fakeFetch(opts: { type?: string; bytes?: number; body?: Uint8Array; metaStatus?: number }) {
  const calls: { url: string; method: string }[] = []
  const f = (async (url: any, init?: any) => {
    const u = String(url), method = init?.method ?? 'GET'; calls.push({ url: u, method })
    if (method === 'DELETE') return new Response('{}', { status: 200 })
    if (u.includes('/resources/raw/authenticated/')) return new Response(JSON.stringify({ type: opts.type ?? 'authenticated', bytes: opts.bytes ?? 1234 }), { status: opts.metaStatus ?? 200 })
    return new Response((opts.body ?? new TextEncoder().encode('%PDF-1.4 hello')) as any, { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}

test('a genuine private PDF is accepted', async () => {
  const { f } = fakeFetch({}); const r = await verifyUploadedAsset(cfg, { publicId: 'mandate-letters/a/b.pdf', declaredExt: 'pdf' }, f)
  assert.deepEqual(r, { ok: true, bytes: 1234, format: 'pdf' })
})
test('an executable renamed .pdf is rejected AND deleted from storage', async () => {
  const { f, calls } = fakeFetch({ body: new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]) })
  const r = await verifyUploadedAsset(cfg, { publicId: 'mandate-letters/a/b.pdf', declaredExt: 'pdf' }, f)
  assert.equal(r.ok, false); assert.ok(calls.some(c => c.method === 'DELETE'))
})
test('an asset that is not private, or is oversized, is rejected and deleted', async () => {
  for (const o of [{ type: 'upload' }, { bytes: MAX_BYTES + 1 }, { bytes: 0 }]) {
    const { f, calls } = fakeFetch(o); const r = await verifyUploadedAsset(cfg, { publicId: 'mandate-letters/a/b.pdf', declaredExt: 'pdf' }, f)
    assert.equal(r.ok, false); assert.ok(calls.some(c => c.method === 'DELETE'))
  }
})
test('a missing upload is a clear retryable failure', async () => {
  const { f } = fakeFetch({ metaStatus: 404 }); const r = await verifyUploadedAsset(cfg, { publicId: 'mandate-letters/a/b.pdf', declaredExt: 'pdf' }, f)
  assert.equal(r.ok, false)
  const boom = (async () => { throw new Error('network') }) as unknown as typeof fetch
  assert.equal((await verifyUploadedAsset(cfg, { publicId: 'mandate-letters/a/b.pdf', declaredExt: 'pdf' }, boom)).ok, false)
})
test('readHead stops after the requested bytes', async () => {
  const res = new Response(new Uint8Array(100000).fill(65) as any); assert.equal((await readHead(res, 16)).length, 16)
})
