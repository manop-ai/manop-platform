import test from 'node:test'
import assert from 'node:assert/strict'
import { validateMessage, visibleMessages, isRateLimited, unreadCount, recipientsNote, MAX_MESSAGE_LENGTH, RATE_LIMIT_COUNT, type MessageRow } from '../lib/deal-room-messages'

const m = (o: Partial<MessageRow>): MessageRow => ({ id: 'x', lead_id: 'l', sender_user_id: 'u1', sender_party: 'buyer', body: 'hi', visibility: 'all', created_at: '2026-10-23T10:00:00Z', ...o })

test('validation: empty, too long, system', () => {
  assert.equal(validateMessage('   ', 'buyer', 'all').ok, false)
  assert.equal(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1), 'buyer', 'all').ok, false)
  assert.equal(validateMessage('hello', 'system', 'all').ok, false)
  const ok = validateMessage('  hello \r\n there ', 'buyer', 'all'); assert.ok(ok.ok && ok.body === 'hello \n there')
})
test('only admin can write internal notes; others cannot smuggle visibility', () => {
  assert.equal(validateMessage('x', 'developer', 'internal').ok, false)
  const a = validateMessage('x', 'admin', 'internal'); assert.ok(a.ok && a.visibility === 'internal')
  const d = validateMessage('x', 'developer', 'garbage'); assert.ok(d.ok && d.visibility === 'all')
})
test('parties never see internal notes or other users ids; admin sees all', () => {
  const rows = [m({ id: '1' }), m({ id: '2', visibility: 'internal', sender_party: 'admin', sender_user_id: 'adm' }), m({ id: '3', sender_user_id: 'u2', sender_party: 'developer' })]
  const b = visibleMessages('buyer', 'u1', rows)
  assert.deepEqual(b.map(x => x.id), ['1', '3'])
  assert.equal(b[0].sender_user_id, 'u1'); assert.equal(b[1].sender_user_id, null)
  assert.equal(visibleMessages('admin', 'adm', rows).length, 3)
})
test('rate limit', () => {
  const now = Date.now()
  const stamps = Array.from({ length: RATE_LIMIT_COUNT }, () => new Date(now - 1000).toISOString())
  assert.equal(isRateLimited(stamps, now), true)
  assert.equal(isRateLimited(stamps.slice(1), now), false)
  assert.equal(isRateLimited(stamps.map(() => new Date(now - 120000).toISOString()), now), false)
})
test('unread counts only others messages after last read', () => {
  const rows = [m({ id: '1', created_at: '2026-10-23T09:00:00Z' }), m({ id: '2', sender_user_id: 'u2', created_at: '2026-10-23T09:30:00Z' }), m({ id: '3', sender_user_id: 'u2', created_at: '2026-10-23T11:00:00Z' })]
  assert.equal(unreadCount(rows, 'u1', '2026-10-23T10:00:00Z'), 1)
  assert.equal(unreadCount(rows, 'u1', null), 2)
})
test('admin is notified of party messages, never of internal notes', () => {
  assert.equal(recipientsNote('buyer', 'all'), 'admin')
  assert.equal(recipientsNote('admin', 'all'), 'none')
  assert.equal(recipientsNote('admin', 'internal'), 'none')
})
