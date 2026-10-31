// app/api/paystack/webhook/route.ts — Paystack events. The raw body's HMAC-SHA512 signature is verified first; each event is processed once
// (paystack_events.event_key unique); and a charge.success is NEVER taken at face value: settle() asks Paystack to verify and compares amount,
// currency and reference with what MANOP recorded. Always answers 200 for a valid, handled event so Paystack does not retry needlessly.
import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { paystackConfig, validSignature, eventKey } from '../../../../lib/paystack'
import { settle } from '../../../../lib/paystack-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const cfg = paystackConfig(); if (!cfg) return NextResponse.json({ error: 'not configured' }, { status: 503 })
  const raw = await req.text()
  if (!validSignature(raw, req.headers.get('x-paystack-signature'), cfg.secretKey)) return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  let ev: any; try { ev = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }
  const type = String(ev?.event ?? ''), reference = ev?.data?.reference ? String(ev.data.reference) : undefined
  const key = eventKey(type, reference, ev?.data?.id)
  const { error } = await sbAdmin.from('paystack_events').insert({ event_key: key, event_type: type, reference: reference ?? null, signature_valid: true, outcome: 'received' })
  if (error?.code === '23505') return NextResponse.json({ ok: true, duplicate: true })       // replayed event
  if (error) { console.error('paystack_events insert', error.message); return NextResponse.json({ error: 'try again' }, { status: 500 }) }
  let outcome = 'ignored'
  if (type === 'charge.success' && reference) outcome = (await settle(reference)).status
  await sbAdmin.from('paystack_events').update({ outcome }).eq('event_key', key)
  return NextResponse.json({ ok: true })
}