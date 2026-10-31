// app/api/agency/subscription/route.ts — an agency's own Agency Subscription: see its state, and REQUEST one.
// Requesting records a request only. Payment is confirmed, the subscription approved and activated by MANOP admins (separate steps,
// each recorded), so a submitted request never makes an agency "active". There is no payment provider: payment instructions come
// from MANOP, and an admin records the payment reference once the money is actually received.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { getEffectiveTerms, subscriptionTermsView } from '../../../../lib/commercial-server'
import { subscriptionPhase, SUBSCRIPTION_PHASE_LABEL } from '../../../../lib/commercial-terms'
import { escapeHtml, notificationHtml, sendAdminNotification, adminEmailConfig } from '../../../../lib/email'

async function agencyOf(req: NextRequest) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) } as const
  const { data: agency } = await sb.from('data_partners').select('id,name,contact_email,verification_status,active').eq('auth_user_id', user.id).maybeSingle()
  if (!agency) return { error: NextResponse.json({ error: 'Agency Subscription is available to agency accounts.' }, { status: 403 }) } as const
  return { sb, user, agency } as const
}

function present(row: Record<string, any> | null) {
  if (!row) return null
  const phase = subscriptionPhase(row as any)
  return { id: row.id, phase, phaseLabel: SUBSCRIPTION_PHASE_LABEL[phase], priceAmount: row.price_amount, priceCurrency: row.price_currency, periodMonths: row.period_months,
    requestedAt: row.requested_at, periodStart: row.period_start, periodEnd: row.period_end, suspendedReason: row.suspended_reason }
}

export async function GET(req: NextRequest) {
  const a = await agencyOf(req); if ('error' in a) return a.error
  const { data: rows } = await a.sb.from('agency_subscriptions').select('*').eq('agency_id', a.agency.id).order('created_at', { ascending: false }).limit(1)
  const terms = subscriptionTermsView(await getEffectiveTerms())
  return NextResponse.json({
    agency: { name: a.agency.name, registration: a.agency.verification_status ?? 'not_started' },   // registration/verification: unchanged, separate from the subscription
    terms, subscription: present(rows?.[0] ?? null),
    notice: 'An Agency Subscription does not give exclusivity, guarantee any commission, verify your submissions, or open confidential documents.',
  })
}

export async function POST(req: NextRequest) {
  const a = await agencyOf(req); if ('error' in a) return a.error
  // V1: there is no universal subscription price. Agencies request a CUSTOM subscription (/api/agency/subscription-request) and MANOP issues a proposal.
  if (process.env.MANOP_ALLOW_LEGACY_SUBSCRIPTION_REQUEST !== 'true') return NextResponse.json({ error: 'Agency subscriptions are now custom. Send a custom subscription request from the Agreement tab and MANOP will prepare a proposal.' }, { status: 409 })
  const { data: existing } = await sbAdmin.from('agency_subscriptions').select('*').eq('agency_id', a.agency.id).order('created_at', { ascending: false }).limit(1)
  const cur = existing?.[0]
  if (cur && !['declined'].includes(cur.approval_status) && !(cur.activation_status === 'active' && cur.period_end && new Date(cur.period_end) < new Date())) {
    return NextResponse.json({ subscription: present(cur), duplicate: true })            // one open request at a time; double-click safe
  }
  const terms = await getEffectiveTerms(); const view = subscriptionTermsView(terms)
  const { data, error } = await sbAdmin.from('agency_subscriptions').insert({
    agency_id: a.agency.id, requested_by: a.user.id, terms_version_id: terms?.id ?? null, price_amount: view.price, price_currency: view.currency ?? 'NGN', period_months: view.periodMonths,
  }).select().single()
  if (error) return NextResponse.json({ error: 'Could not record your request. Please try again.' }, { status: 500 })
  const cfg = adminEmailConfig(); let notified = false
  if (cfg.configured) { await sendAdminNotification(`Agency Subscription requested — ${escapeHtml(a.agency.name)}`, notificationHtml('Agency Subscription requested', [['Agency', escapeHtml(a.agency.name)], ['Contact', escapeHtml(a.agency.contact_email)], ['Price at request', view.confirmed ? `${escapeHtml(view.currency)} ${view.price}` : 'Price not yet confirmed'], ['Review', '/admin/commercial']])); notified = true }
  return NextResponse.json({ subscription: present(data), notified }, { status: 201 })
}