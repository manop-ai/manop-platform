'use client'
// components/TransactionPromptModal.tsx
//
// PURPOSE:
// After an agency successfully saves a listing, this modal fires.
// It asks: "Have you sold or rented here before?"
// If yes → minimal transaction form → saves to market_transactions
// This is the core flywheel: listings → transaction prompts → market data
// → better benchmarks → better intelligence → more investors → more agencies
//
// MAPE IMPACT:
// A submitted transaction earns I-score points when verified.
// The modal tells the agent exactly how many points they'll earn.
// Earning is visible, immediate, and motivating.
//
// TRANSACTION VERIFICATION:
// All submissions go in with verification_status = 'pending'.
// They are NOT fed into neighborhood_benchmarks until verified.
// Verification happens via:
//   1. Second party (buyer's agent on Manop confirms)
//   2. Manop admin manual review
//   3. Future: cross-reference with survey/registry number
//
// USAGE:
//   import TransactionPromptModal from '../../../components/TransactionPromptModal'
//
//   After listing saves:
//   setShowTxPrompt(true)  // show the modal
//   setTxNeighborhood(listing.neighborhood)
//
//   <TransactionPromptModal
//     partnerId={partner.id}
//     neighborhood={txNeighborhood}
//     city={partner.cities?.[0] || ''}
//     onClose={() => setShowTxPrompt(false)}
//     dark={dark}
//   />

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface Props {
  partnerId:    string
  neighborhood: string
  city:         string
  dark:         boolean
  onClose:      () => void
}

interface TxDraft {
  bedrooms:      string
  property_type: string
  price_ngn:     string
  sold_month:    string  // YYYY-MM
  listing_type:  string  // sale | rent
  reference:     string  // optional survey/property number
  buyer_agent:   string  // optional — if buyer had a Manop agent
}

const EMPTY_TX: TxDraft = {
  bedrooms: '', property_type: '', price_ngn: '',
  sold_month: '', listing_type: 'sale',
  reference: '', buyer_agent: '',
}

type Step = 'prompt' | 'form' | 'done'

function fmtNGN(val: string): string {
  const n = parseFloat(val.replace(/,/g, ''))
  if (isNaN(n)) return ''
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `₦${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `₦${(n / 1_000).toFixed(0)}K`
  return `₦${n}`
}

export default function TransactionPromptModal({ partnerId, neighborhood, city, dark, onClose }: Props) {
  const [step,    setStep]    = useState<Step>('prompt')
  const [tx,      setTx]      = useState<TxDraft>(EMPTY_TX)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const bg      = dark ? '#0F172A' : '#FFFFFF'
  const bg2     = dark ? '#1E293B' : '#F8FAFC'
  const bg3     = dark ? '#162032' : '#F1F5F9'
  const text    = dark ? '#F8FAFC' : '#0F172A'
  const text2   = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3   = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border  = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const purple  = '#5B2EFF'
  const teal    = '#14B8A6'
  const green   = '#22C55E'
  const amber   = '#F59E0B'

  function set<K extends keyof TxDraft>(key: K, val: string) {
    setTx(d => ({ ...d, [key]: val }))
  }

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.8rem',
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${border}`,
    borderRadius: 8, color: text, fontSize: '0.875rem',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }

  const LBL: React.CSSProperties = {
    display: 'block', fontSize: '0.68rem', fontWeight: 600,
    color: text2, marginBottom: '0.3rem',
  }

  const SEL = (value: string, onChange: (v: string) => void, options: Array<{ id: string; label: string }>) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      onFocus={e => (e.target.style.borderColor = purple)}
      onBlur={e => (e.target.style.borderColor = border)}
      style={{ ...INP, cursor: 'pointer', appearance: 'none' as const }}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )

  async function handleSubmit() {
    if (!tx.price_ngn || !tx.sold_month) {
      setError('Sale price and approximate date are required.')
      return
    }
    const price = parseFloat(tx.price_ngn.replace(/,/g, ''))
    if (isNaN(price) || price <= 0) {
      setError('Enter a valid sale price.')
      return
    }

    setError('')
    setSaving(true)

    try {
      // Parse YYYY-MM to a date
      const [year, month] = tx.sold_month.split('-')
      const soldDate = `${year}-${month}-15`  // mid-month as approximation

      const row = {
        neighborhood:        neighborhood,
        city:                city,
        country_code:        'NG',  // TODO: derive from city
        bedrooms:            tx.bedrooms ? parseInt(tx.bedrooms) : null,
        property_type:       tx.property_type || null,
        sold_price:          Math.round(price),
        currency_code:       'NGN',
        sold_at:             soldDate,
        submitted_by:        partnerId,
        verification_status: 'pending',
        evidence_type:       tx.reference ? 'reference_number' : 'agent_confirmed',
        raw_data: {
          source:            'listing_prompt',
          listing_type:      tx.listing_type,
          reference_number:  tx.reference || null,
          buyer_agent:       tx.buyer_agent || null,
          submitted_at:      new Date().toISOString(),
        },
      }

      const { error: dbErr } = await sb
        .from('market_transactions')
        .insert(row)

      if (dbErr) throw new Error(dbErr.message)

      // Also log the MAPE activity event for the cron to process
      await sb.from('mape_activity_log').insert({
        partner_id:   partnerId,
        dimension:    'I',
        points:       0,  // 0 until verified — cron updates this
        reason:       `Transaction submitted for ${neighborhood} — pending verification`,
      })

      setStep('done')

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Overlay backdrop ────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: bg, borderRadius: 16,
        border: `1px solid ${border}`,
        maxWidth: 480, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>

        {/* ── STEP 1: PROMPT ──────────────────────────────── */}
        {step === 'prompt' && (
          <div style={{ padding: '1.75rem' }}>
            {/* MAPE incentive banner */}
            <div style={{
              background: `rgba(91,46,255,0.08)`,
              border: `1px solid rgba(91,46,255,0.2)`,
              borderRadius: 10, padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: '1.2rem' }}>📊</div>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7C5FFF', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 2 }}>
                  Earn intelligence points
                </div>
                <div style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.5 }}>
                  Verified transactions earn up to <strong style={{ color: text }}>+20 I-score pts</strong> each — the most valuable MAPE action you can take.
                </div>
              </div>
            </div>

            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: text, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
              Have you sold or rented here before?
            </h2>
            <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.65, marginBottom: '1.5rem' }}>
              You just listed in <strong style={{ color: text }}>{neighborhood}</strong>. If you've closed a deal in this area, sharing the transaction data strengthens the market benchmarks — and your MAPE score.
            </p>
            <p style={{ fontSize: '0.75rem', color: text3, lineHeight: 1.6, marginBottom: '1.5rem', padding: '0.75rem', background: bg3, borderRadius: 8 }}>
              Your transaction data is confidential. It is only used in aggregated form to compute neighborhood price benchmarks. Individual transaction details are never shown publicly.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setStep('form')}
                style={{ flex: 2, padding: '0.8rem', background: purple, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Yes, add a past transaction →
              </button>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: '0.8rem', background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 10, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: FORM ─────────────────────────────────── */}
        {step === 'form' && (
          <div style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: text, letterSpacing: '-0.02em' }}>
                Add transaction — {neighborhood}
              </h2>
              <button onClick={() => setStep('prompt')} style={{ background: 'none', border: 'none', color: text3, cursor: 'pointer', fontSize: '1.1rem', fontFamily: 'inherit', padding: 4 }}>←</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={LBL}>Transaction type</label>
                {SEL(tx.listing_type, v => set('listing_type', v), [
                  { id: 'sale', label: 'Sale (closed deal)' },
                  { id: 'rent', label: 'Rental (signed lease)' },
                ])}
              </div>
              <div>
                <label style={LBL}>Bedrooms</label>
                {SEL(tx.bedrooms, v => set('bedrooms', v), [
                  { id: '0', label: 'Studio' },
                  { id: '1', label: '1 bedroom' },
                  { id: '2', label: '2 bedrooms' },
                  { id: '3', label: '3 bedrooms' },
                  { id: '4', label: '4 bedrooms' },
                  { id: '5', label: '5+ bedrooms' },
                ])}
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={LBL}>
                {tx.listing_type === 'rent' ? 'Annual rent (₦) *' : 'Sale price (₦) *'}
              </label>
              <input
                style={INP}
                type="text"
                placeholder={tx.listing_type === 'rent' ? 'e.g. 4500000' : 'e.g. 180000000'}
                value={tx.price_ngn}
                onChange={e => set('price_ngn', e.target.value.replace(/[^0-9.]/g, ''))}
                onFocus={e => (e.target.style.borderColor = purple)}
                onBlur={e => (e.target.style.borderColor = border)}
              />
              {tx.price_ngn && (
                <div style={{ fontSize: '0.7rem', color: green, marginTop: '0.25rem', fontWeight: 600 }}>
                  {fmtNGN(tx.price_ngn)}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={LBL}>Approximate date *</label>
              <input
                style={INP}
                type="month"
                value={tx.sold_month}
                onChange={e => set('sold_month', e.target.value)}
                onFocus={e => (e.target.style.borderColor = purple)}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>

            {/* Optional fields */}
            <div style={{
              background: bg3, border: `1px solid ${border}`,
              borderRadius: 10, padding: '0.875rem', marginBottom: '0.875rem',
            }}>
              <div style={{ fontSize: '0.62rem', color: teal, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
                Optional — helps with verification
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ ...LBL, color: teal }}>Property ref / survey no.</label>
                  <input
                    style={INP}
                    placeholder="e.g. LK/1234/2024"
                    value={tx.reference}
                    onChange={e => set('reference', e.target.value)}
                    onFocus={e => (e.target.style.borderColor = teal)}
                    onBlur={e => (e.target.style.borderColor = border)}
                  />
                </div>
                <div>
                  <label style={{ ...LBL, color: teal }}>Buyer's agent (if on Manop)</label>
                  <input
                    style={INP}
                    placeholder="Agency name"
                    value={tx.buyer_agent}
                    onChange={e => set('buyer_agent', e.target.value)}
                    onFocus={e => (e.target.style.borderColor = teal)}
                    onBlur={e => (e.target.style.borderColor = border)}
                  />
                  <div style={{ fontSize: '0.62rem', color: text3, marginTop: '0.2rem' }}>
                    Enables 2-party cross-verification (+faster approval)
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 8, padding: '0.65rem 0.875rem', marginBottom: '1rem',
              fontSize: '0.72rem', color: amber, lineHeight: 1.55,
            }}>
              This goes in as pending. Once verified by Manop or a second party, it earns you <strong>+20 Intelligence score points</strong> and feeds the neighborhood benchmark.
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '0.65rem', fontSize: '0.8rem', color: '#EF4444', marginBottom: '0.875rem' }}>
                ✗ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 10, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                Skip
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{ flex: 2, padding: '0.75rem', background: purple, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                {saving ? (
                  <>
                    <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                    Saving…
                  </>
                ) : 'Submit transaction →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: DONE ─────────────────────────────────── */}
        {step === 'done' && (
          <div style={{ padding: '2rem 1.75rem', textAlign: 'center' as const }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✓</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: green, marginBottom: '0.5rem' }}>
              Transaction submitted
            </h2>
            <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.65, marginBottom: '0.5rem' }}>
              It's now pending verification. Once verified, it will contribute to {neighborhood} market benchmarks and earn you <strong style={{ color: text }}>+20 Intelligence score points</strong>.
            </p>
            <p style={{ fontSize: '0.75rem', color: text3, lineHeight: 1.55, marginBottom: '1.5rem' }}>
              If you listed the buyer's agent, they'll receive a cross-verification request — this is the fastest route to approval.
            </p>
            <button
              onClick={onClose}
              style={{ padding: '0.75rem 2rem', background: purple, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Done
            </button>
          </div>
        )}

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}