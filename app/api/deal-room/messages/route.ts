// app/api/deal-room/messages/route.ts
//
//   GET  ?lead_id=…            → the conversation (what the caller may see) + unread count
//   POST {lead_id, body, client_message_id?, visibility?} → add a message
//
// Authorization is loadAccess(): the same decision as the milestone Deal Room. Reads and writes use the
// service role only after that decision. MANOP is emailed when a party writes (so requests are noticed);
// parties are not emailed the message text.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { loadAccess } from '../../../../lib/deal-room-server'
import { sendAdminNotification, notificationHtml } from '../../../../lib/email'
import { validateMessage, visibleMessages, isRateLimited, unreadCount, recipientsNote, PARTY_LABEL, type MessageRow } from '../../../../lib/deal-room-messages'

export const dynamic = 'force-dynamic'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const COLS = 'id, lead_id, sender_user_id, sender_party, body, visibility, created_at'

function isMissingTable(e: any) {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
}
const NOT_READY = 'Messaging is not switched on yet (database update pending).'

export async function GET(req: NextRequest) {
  try {
    const leadId = req.nextUrl.searchParams.get('lead_id')
    if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
    const r = await loadAccess(req, leadId)
    if (!('access' in r)) return NextResponse.json({ error: r.error }, { status: r.status })
    const { access } = r

    const { data, error } = await sbAdmin.from('deal_room_messages').select(COLS).eq('lead_id', leadId).order('created_at', { ascending: true }).limit(500)
    if (error) return NextResponse.json({ error: isMissingTable(error) ? NOT_READY : 'Could not load messages.', not_ready: isMissingTable(error) }, { status: isMissingTable(error) ? 503 : 500 })
    const rows = visibleMessages(access.party, access.userId, (data || []) as MessageRow[])

    const { data: rd } = await sbAdmin.from('deal_room_reads').select('last_read_at').eq('lead_id', leadId).eq('user_id', access.userId).maybeSingle()
    const unread = unreadCount(rows, access.userId, rd?.last_read_at ?? null)

    // Opening the conversation marks it read.
    if (req.nextUrl.searchParams.get('mark_read') === '1') {
      await sbAdmin.from('deal_room_reads').upsert({ lead_id: leadId, user_id: access.userId, last_read_at: new Date().toISOString() }, { onConflict: 'lead_id,user_id' })
    }
    return NextResponse.json({ party: access.party, userId: access.userId, messages: rows, unread })
  } catch (e: any) {
    return NextResponse.json({ error: 'Could not load messages.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
    const leadId: string = body?.lead_id
    if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    const r = await loadAccess(req, leadId)
    if (!('access' in r)) return NextResponse.json({ error: r.error }, { status: r.status })
    const { access } = r

    const v = validateMessage(body.body, access.party, body.visibility)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const clientId = typeof body.client_message_id === 'string' ? body.client_message_id.slice(0, 80) : null

    const since = new Date(Date.now() - 60_000).toISOString()
    const { data: recent, error: rerr } = await sbAdmin.from('deal_room_messages').select('created_at').eq('lead_id', leadId).eq('sender_user_id', access.userId).gte('created_at', since)
    if (rerr) return NextResponse.json({ error: isMissingTable(rerr) ? NOT_READY : 'Could not send.' }, { status: isMissingTable(rerr) ? 503 : 500 })
    if (isRateLimited((recent || []).map((x: any) => x.created_at))) return NextResponse.json({ error: 'You are sending messages very quickly. Wait a moment and try again.' }, { status: 429 })

    const { data: ins, error } = await sbAdmin.from('deal_room_messages').insert({
      lead_id: leadId, sender_user_id: access.userId, sender_party: access.party,
      body: v.body!, visibility: v.visibility!, client_message_id: clientId,
    }).select(COLS).single()

    if (error) {
      if (error.code === '23505' && clientId) {
        // Same client_message_id already stored: a double-click or retry. Return the original.
        const { data: existing } = await sbAdmin.from('deal_room_messages').select(COLS).eq('lead_id', leadId).eq('sender_user_id', access.userId).eq('client_message_id', clientId).maybeSingle()
        return NextResponse.json({ message: existing, duplicate: true })
      }
      return NextResponse.json({ error: isMissingTable(error) ? NOT_READY : 'Could not send.' }, { status: isMissingTable(error) ? 503 : 500 })
    }

    await sbAdmin.from('deal_room_reads').upsert({ lead_id: leadId, user_id: access.userId, last_read_at: new Date().toISOString() }, { onConflict: 'lead_id,user_id' })

    if (recipientsNote(access.party, v.visibility!) === 'admin') {
      try {
        await sendAdminNotification(
          `Deal Room message: ${access.lead.manop_lead_id ?? leadId}`,
          notificationHtml(`New message from ${PARTY_LABEL[access.party]}`, [
            ['Introduction', String(access.lead.manop_lead_id ?? leadId)],
            ['From', PARTY_LABEL[access.party]],
            ['Message', esc(v.body!.slice(0, 500))],
          ]),
        )
      } catch { /* the message is stored; notification is best effort */ }
    }
    return NextResponse.json({ message: ins })
  } catch {
    return NextResponse.json({ error: 'Could not send.' }, { status: 500 })
  }
}