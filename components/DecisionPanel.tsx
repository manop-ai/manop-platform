'use client'
// components/DecisionPanel.tsx
//
// FINANCE INTELLIGENCE PASS:
// - decision.deal (DealAssessment/DealVerdict) is gone from lib/decision-engine —
//   replaced by decision.market (MarketSignal), which reports facts (yield,
//   price vs. median) with no verdict attached. Updated all field access
//   below accordingly: decision.market.summary replaces decision.deal.headline/
//   reasoning, and the verdict-colored "Manop verdict" card is now a neutral
//   "Market signal" card with no suggested-offer block (that number no longer
//   exists — it was part of the removed verdict logic).
// - The dead 'enquiry'/'whatsapp' no-op action is gone along with the verdict
//   branch that produced it; next.primary is now always "Run Investment
//   Intelligence" and next.secondary is always "See similar properties".
// - Switched from a locally-created Supabase client to the canonical
//   singleton (lib/supabase/client.ts) — every 'use client' component should
//   import { sb } from there rather than calling createClient() itself.
//
// Trust scoring (trust.level/label/color/score/explanation) is UNCHANGED —
// that part of the decision engine is being handled separately.

import { useState, useEffect } from 'react'
import { LineChart, Search, Bookmark, BookmarkCheck, ArrowRight, Check } from 'lucide-react'
import { sb } from '../lib/supabase/client'
import { buildPropertyDecision } from '../lib/decision-engine'
import type { PropertyDecision, NextStepIcon } from '../lib/decision-engine'

// Maps decision-engine's icon keys to real components — engine stays
// framework-agnostic (no JSX import there), UI stays glyph-free here.
const NEXT_STEP_ICONS: Record<NextStepIcon, typeof LineChart> = {
  investment: LineChart,
  search: Search,
}

// ── Local definition — NOT imported from lib/decision-engine ───────────
// decision-engine does not export fetchAgentTrustLevel.
async function fetchAgentTrustLevel(agencyName: string | null | undefined): Promise<string | null> {
  if (!agencyName) return null
  try {
    const res = await fetch(`/api/agent-trust?agency=${encodeURIComponent(agencyName)}`)
    if (res.ok) {
      const json = await res.json()
      return json.trustLevel || null
    }
  } catch (err) {
    console.error('[DecisionPanel] fetchAgentTrustLevel:', err)
  }
  return null
}

interface Property {
  id:                  string
  property_type:       string | null
  bedrooms:            number | null
  bathrooms:           number | null
  price_local:         number | null
  price_usd:           number | null
  currency_code:       string | null
  listing_type:        string | null
  title_document_type: string | null
  size_sqm:            number | null
  neighborhood:        string | null
  city:                string | null
  source_type:         string | null
  confidence:          number | null
  agent_phone:         string | null
  data_partner_id:     string | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

interface Props {
  property: Property
  dark:     boolean
}

export default function DecisionPanel({ property: p, dark }: Props) {
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const bg3    = dark ? '#162032' : '#FFFFFF'

  const raw        = (p.raw_data || {}) as Record<string, unknown>
  const agencyName = raw.source_agency as string | undefined

  const daysListed = p.created_at
    ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
    : undefined

  const [decision, setDecision] = useState<PropertyDecision | null>(null)
  const [saved,    setSaved]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  // ── Build decision on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function fetchDecision() {
      try {
        const agentTrustLevel = await fetchAgentTrustLevel(agencyName)
        const d = await buildPropertyDecision({
          neighborhood:     p.neighborhood || '',
          bedrooms:         p.bedrooms,
          priceLocal:       p.price_local || 0,
          listingType:      p.listing_type,
          sourceType:       p.source_type,
          confidence:       p.confidence,
          titleDocument:    p.title_document_type,
          agencyName:       agencyName || null,
          agentPhone:       p.agent_phone,
          daysListed,
          weeklyViews:      0,
          weeklyEnquiries:  0,
          agentTrustLevel,
        })
        setDecision(d)
      } catch (err) {
        console.error('[DecisionPanel] buildPropertyDecision error:', err)
      }
    }
    fetchDecision()
  }, [p.id]) // eslint-disable-line

  // ── FIX 2: Watchlist check — was .then().catch() on PromiseLike ────────────
  useEffect(() => {
    const local = JSON.parse(localStorage.getItem('manop_watchlist') || '[]')
    if (local.includes(p.id)) { setSaved(true); return }

    async function checkWatchlist() {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (!session?.user) return
        const { data } = await sb
          .from('investor_watchlist')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('property_id', p.id)
          .maybeSingle()
        if (data) setSaved(true)
      } catch (err) {
        console.error('[DecisionPanel] watchlist check:', err)
      }
    }
    checkWatchlist()
  }, [p.id]) // eslint-disable-line

  // ── Save to watchlist ──────────────────────────────────────────────────────
  async function handleSave() {
    if (saved || saving) return
    setSaving(true)
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (session?.user) {
        const { error } = await sb.from('investor_watchlist').upsert({
          user_id:       session.user.id,
          property_id:   p.id,
          price_at_save: p.price_local,
          status:        'watching',
          saved_at:      new Date().toISOString(),
        }, { onConflict: 'user_id,property_id' })
        if (error) throw new Error(error.message)
      } else {
        const local = JSON.parse(localStorage.getItem('manop_watchlist') || '[]')
        if (!local.includes(p.id)) {
          local.push(p.id)
          localStorage.setItem('manop_watchlist', JSON.stringify(local))
        }
      }
      setSaved(true)
      setSaveMsg(session?.user ? 'Saved to your watchlist' : 'Saved — sign in to sync across devices')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (err) {
      console.error('[DecisionPanel] handleSave:', err)
      setSaveMsg('Could not save. Please try again.')
      setTimeout(() => setSaveMsg(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleAction(action: string) {
    if (action === 'save')       { handleSave(); return }
    if (action === 'investment-intelligence') { window.open('/calculator', '_blank'); return }
    if (action === 'search')     { window.location.href = `/search?neighborhood=${encodeURIComponent(p.neighborhood || '')}`; return }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!decision) return (
    <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div style={{ width: 16, height: 16, border: '2px solid rgba(91,46,255,0.2)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <span style={{ fontSize: '0.78rem', color: text3 }}>Computing verdict…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const { trust, market, next, signals, confidence: engineConf } = decision
  const mc = '#14B8A6' // neutral market-signal accent — no verdict color scale anymore

  return (
    <div style={{ marginBottom: '1rem' }}>

      {/* ── MARKET SIGNAL CARD ── */}
      <div style={{ background: bg3, border: `1.5px solid ${mc}30`, borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
            Market signal
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <div style={{ fontSize: '0.58rem', color: text3, marginBottom: 4 }}>Confidence</div>
            <div style={{ width: 42, height: 4, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden', marginLeft: 'auto' }}>
              <div style={{ height: '100%', width: `${engineConf}%`, background: mc, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: '0.6rem', color: mc, marginTop: 3, fontWeight: 600 }}>{engineConf}%</div>
          </div>
        </div>

        {/* market.summary — neutral, descriptive, no verdict */}
        <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65 }}>
          {market.summary}
        </div>
      </div>

      {/* ── TRUST SIGNAL ── */}
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: trust.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: trust.color, background: `${trust.color}18`, border: `1px solid ${trust.color}30`, borderRadius: 20, padding: '1px 8px' }}>
              {trust.label}
            </span>
            {agencyName && <span style={{ fontSize: '0.68rem', color: text3 }}>{agencyName}</span>}
          </div>
          <div style={{ fontSize: '0.72rem', color: text2, lineHeight: 1.5 }}>
            {trust.explanation}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
          <div style={{ fontSize: '0.62rem', color: text3, marginBottom: 3 }}>Trust</div>
          <div style={{ width: 36, height: 4, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${trust.score}%`, background: trust.color, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: '0.58rem', color: trust.color, marginTop: 2, fontWeight: 600 }}>{trust.score}/100</div>
        </div>
      </div>

      {/* ── KEY SIGNALS ── */}
      {signals.length > 0 && (
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>
            Key signals
          </div>
          {signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.78rem', color: text2, marginBottom: i < signals.length - 1 ? 5 : 0 }}>
              <ArrowRight size={13} style={{ color: '#14B8A6', flexShrink: 0, marginTop: 2 }} />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── NEXT STEP ── */}
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
          What to do next
        </div>
        <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.6, marginBottom: '0.875rem' }}>
          {next.message}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
          <button
            onClick={() => handleAction(next.primary.action)}
            style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 9, padding: '0.7rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            {(() => { const Icon = NEXT_STEP_ICONS[next.primary.icon]; return <Icon size={15} /> })()}
            {next.primary.label}
          </button>

          {next.secondary && next.secondary.action !== 'save' && (
            <button
              onClick={() => handleAction(next.secondary!.action)}
              style={{ width: '100%', background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 9, padding: '0.65rem 1rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            >
              {(() => { const Icon = NEXT_STEP_ICONS[next.secondary.icon]; return <Icon size={15} /> })()}
              {next.secondary.label}
            </button>
          )}

          {/* Single watchlist button */}
          <button
            onClick={handleSave}
            disabled={saved || saving}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
              background: saved ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.25)'}`,
              color: saved ? '#22C55E' : '#F59E0B',
              fontSize: '0.75rem', fontWeight: 600,
              cursor: saved ? 'default' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? (
              <>
                <div style={{ width: 12, height: 12, border: '2px solid rgba(245,158,11,0.3)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Saving…
              </>
            ) : saved ? (
              <><BookmarkCheck size={14} /> Saved to watchlist</>
            ) : (
              <><Bookmark size={14} /> Save to watchlist</>
            )}
          </button>

          {saveMsg && (
            <div style={{ fontSize: '0.7rem', color: saveMsg.toLowerCase().startsWith('saved') ? '#22C55E' : '#EF4444', textAlign: 'center' as const, lineHeight: 1.5 }}>
              {saveMsg}
            </div>
          )}
        </div>
      </div>

      {/* ── DISCLAIMER ── */}
      <div style={{ fontSize: '0.62rem', color: text3, lineHeight: 1.6, padding: '0 0.25rem' }}>
        Signals computed by Manop intelligence engine from verified listing data — not a recommendation.
        {engineConf < 70 && ' Limited data for this area — treat as indicative.'}
        {' '}Always conduct independent due diligence, and run Investment Intelligence with your own numbers before transacting.
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}