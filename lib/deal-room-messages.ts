// lib/deal-room-messages.ts
//
// Pure rules for the Deal Room conversation. No database access here so the
// rules can be tested; app/api/deal-room/messages applies them after loadAccess().

import type { Party } from './deal-room'

export const MAX_MESSAGE_LENGTH = 4000
export const RATE_LIMIT_COUNT = 20      // messages …
export const RATE_LIMIT_WINDOW_MS = 60_000 // … per minute per sender per introduction

export type Visibility = 'all' | 'internal'

export interface MessageRow {
  id: string
  lead_id: string
  sender_user_id: string | null
  sender_party: Party
  body: string
  visibility: Visibility
  created_at: string
}

export function validateMessage(raw: unknown, party: Party, visibility: unknown): { ok: boolean; body?: string; visibility?: Visibility; error?: string } {
  if (party === 'system') return { ok: false, error: 'Not permitted.' }
  const body = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : ''
  if (!body) return { ok: false, error: 'Write a message first.' }
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.` }
  const v: Visibility = visibility === 'internal' ? 'internal' : 'all'
  if (v === 'internal' && party !== 'admin') return { ok: false, error: 'Only MANOP can write internal notes.' }
  return { ok: true, body, visibility: v }
}

/** Parties other than admin never see internal notes, and never see another user's id. */
export function visibleMessages(party: Party, userId: string, rows: MessageRow[]): MessageRow[] {
  const admin = party === 'admin'
  return rows
    .filter(m => admin || m.visibility === 'all')
    .map(m => (admin || m.sender_user_id === userId ? m : { ...m, sender_user_id: null }))
}

export function isRateLimited(recentTimestamps: string[], now = Date.now()): boolean {
  const recent = recentTimestamps.filter(t => now - new Date(t).getTime() < RATE_LIMIT_WINDOW_MS)
  return recent.length >= RATE_LIMIT_COUNT
}

export function unreadCount(rows: MessageRow[], userId: string, lastReadAt: string | null): number {
  const since = lastReadAt ? new Date(lastReadAt).getTime() : 0
  return rows.filter(m => m.sender_user_id !== userId && new Date(m.created_at).getTime() > since).length
}

/** Who gets an email nudge: the other side, not the sender. Parties are told, never given the text of private notes. */
export function recipientsNote(senderParty: Party, visibility: Visibility): 'admin' | 'none' {
  if (visibility === 'internal') return 'none'
  return senderParty === 'admin' ? 'none' : 'admin'
}

export const PARTY_LABEL: Record<Party, string> = {
  buyer: 'Buyer', developer: 'Developer', agency: 'Agency', landowner: 'Landowner',
  buyer_agent: 'Buyer’s agent', admin: 'MANOP', system: 'System',
}