'use client'
// components/DealRoomConversation.tsx
//
// The conversation between the parties on one introduction. Reads and writes go through
// /api/deal-room/messages, which applies the same access rules as the milestone Deal Room.
// Messages are statements by the people who wrote them; MANOP does not verify them.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Lock, MessageSquare } from 'lucide-react'
import { authedFetch } from '../lib/authed-fetch'
import { PARTY_LABEL, MAX_MESSAGE_LENGTH, type MessageRow } from '../lib/deal-room-messages'
import type { Party } from '../lib/deal-room'

interface Props { leadId: string; dark?: boolean; onUnread?: (n: number) => void }

const PARTY_COLOR: Record<string, string> = {
  buyer: '#14B8A6', developer: '#6366F1', agency: '#F59E0B', landowner: '#10B981',
  buyer_agent: '#EC4899', admin: '#38BDF8', system: '#94A3B8',
}

function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date()
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const y = new Date(); y.setDate(t.getDate() - 1)
  if (same(d, t)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

export default function DealRoomConversation({ leadId, dark = true, onUnread }: Props) {
  const [msgs, setMsgs] = useState<MessageRow[]>([])
  const [me, setMe] = useState<{ party: Party; userId: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notReady, setNotReady] = useState(false)
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const clientId = useRef<string>('')

  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3 = dark ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.6)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.16)'
  const bubbleOther = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.05)'

  const load = useCallback(async (markRead = true) => {
    try {
      const res = await authedFetch(`/api/deal-room/messages?lead_id=${encodeURIComponent(leadId)}${markRead ? '&mark_read=1' : ''}`)
      const j = await res.json().catch(() => ({}))
      if (res.status === 503) { setNotReady(true); setLoaded(true); return }
      if (!res.ok) { setError(j.error || 'Could not load the conversation.'); setLoaded(true); return }
      setNotReady(false); setError(null)
      setMsgs(j.messages || []); setMe({ party: j.party, userId: j.userId })
      onUnread?.(0)
      setLoaded(true)
    } catch { setError('Could not load the conversation.'); setLoaded(true) }
  }, [leadId, onUnread])

  useEffect(() => { load(true) }, [load])
  // Refresh while the tab is visible; stops when hidden.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(true) }, 15000)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true); setError(null)
    if (!clientId.current) clientId.current = (crypto as any).randomUUID?.() ?? String(Date.now()) + Math.random()
    try {
      const res = await authedFetch('/api/deal-room/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, body, client_message_id: clientId.current, visibility: internal ? 'internal' : 'all' }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 503) { setNotReady(true); return }
      if (!res.ok) { setError(j.error || 'Could not send.'); return }
      clientId.current = ''
      setDraft('')
      await load(true)
    } finally { setSending(false) }
  }

  if (!loaded) return <div style={{ fontSize: 12.5, color: text3 }}>Loading conversation…</div>
  if (notReady) return <div style={{ fontSize: 12.5, color: text3 }}>Messaging is not switched on yet. It will appear here once the database update is applied.</div>

  let lastDay = ''
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.7rem 1rem', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <MessageSquare size={15} color={text2} />
        <div style={{ fontWeight: 700, fontSize: 13.5, color: text }}>Conversation</div>
        <div style={{ fontSize: 11.5, color: text3, marginLeft: 'auto' }}>
          {me?.party === 'buyer' ? 'You and the seller side, with MANOP' : 'Everyone on this introduction, with MANOP'}
        </div>
      </div>

      <div style={{ maxHeight: 420, minHeight: 160, overflowY: 'auto', padding: '0.9rem 1rem', display: 'grid', gap: 8, alignContent: 'start' }} aria-live="polite">
        {msgs.length === 0 && (
          <div style={{ fontSize: 12.5, color: text3, textAlign: 'center', padding: '1.5rem 0.5rem', lineHeight: 1.6 }}>
            No messages yet. Ask a question, share a document name, or arrange a viewing. Everything written here stays with this introduction.
          </div>
        )}
        {msgs.map(m => {
          const mine = !!me && m.sender_user_id === me.userId
          const day = dayLabel(m.created_at)
          const showDay = day !== lastDay; lastDay = day
          const color = PARTY_COLOR[m.sender_party] ?? '#94A3B8'
          const isInternal = m.visibility === 'internal'
          return (
            <div key={m.id}>
              {showDay && <div style={{ textAlign: 'center', fontSize: 11, color: text3, margin: '6px 0' }}>{day}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isInternal && <Lock size={10} />}{mine ? 'You' : PARTY_LABEL[m.sender_party]}{isInternal ? ' · internal note' : ''}
                  <span style={{ color: text3, fontWeight: 400 }}>{timeLabel(m.created_at)}</span>
                </div>
                <div style={{
                  maxWidth: '85%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13.5, lineHeight: 1.5, color: text,
                  padding: '0.55rem 0.8rem', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: isInternal ? 'rgba(245,158,11,0.14)' : mine ? 'rgba(20,184,166,0.18)' : bubbleOther,
                  border: `1px solid ${isInternal ? 'rgba(245,158,11,0.4)' : mine ? 'rgba(20,184,166,0.35)' : border}`,
                }}>{m.body}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ borderTop: `1px solid ${border}`, padding: '0.7rem 1rem', display: 'grid', gap: 6 }}>
        {error && <div style={{ fontSize: 12, color: '#EF4444' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={draft} maxLength={MAX_MESSAGE_LENGTH} rows={2}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={internal ? 'Internal note (visible to MANOP only)' : 'Write a message. Enter to send, Shift+Enter for a new line.'}
            aria-label="Message"
            style={{ flex: 1, resize: 'vertical', background: 'transparent', color: text, border: `1px solid ${internal ? 'rgba(245,158,11,0.5)' : border}`, borderRadius: 10, padding: '0.5rem 0.7rem', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send message"
            style={{ background: '#14B8A6', color: '#06201C', border: 'none', borderRadius: 10, padding: '0.6rem 0.9rem', fontWeight: 700, fontSize: 13, cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} />{sending ? 'Sending' : 'Send'}
          </button>
        </div>
        {me?.party === 'admin' && (
          <label style={{ fontSize: 12, color: text2, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Internal note (parties will not see it)
          </label>
        )}
        <div style={{ fontSize: 11, color: text3 }}>Messages are kept as a record and cannot be edited. Do not share passwords or card numbers.</div>
      </div>
    </div>
  )
}