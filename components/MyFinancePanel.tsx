'use client'
// components/MyFinancePanel.tsx
//
// PHASE 6 — "My Finance" workspace panel. Per the agreed architecture,
// this is explicitly NOT a standalone Finance Dashboard route — it's a
// panel mounted inside each existing dashboard (investor, developer,
// agency) that shows a logged-in user's own saved finance_analyses rows:
// the Buyer Affordability assessments and Investment Intelligence runs
// they've actually produced, with a MANOP reference they can point back
// to, not a disconnected calculator result that vanished when the tab
// closed.
//
// SCHEMA ASSUMPTION, FLAGGED NOT GUESSED-PAST: finance_analyses.user_id
// is not visible anywhere in this repo (no migration file is tracked
// here), so this assumes the column exists per the original Phase 0/1
// design and keys it the same way investor_watchlist.user_id does —
// directly to auth.users.id, not through user_profiles.id. Confirm with:
//
//   select column_name, data_type from information_schema.columns
//   where table_name = 'finance_analyses' order by ordinal_position;
//
// If user_id isn't there, add it with:
//
//   alter table finance_analyses add column if not exists user_id uuid
//     references auth.users(id);
//
// Until then this panel will just render its empty state (the select
// fails silently, same best-effort posture as every other finance_analyses
// write in this codebase) — it will not break the dashboard it's mounted in.

import { useState, useEffect } from 'react'
import { getAccessToken } from '../lib/authed-fetch'
import { fetchJson, withTimeout } from '../lib/fetch-json'
import MortgageComparePanel from './MortgageComparePanel'
import { FileText, TrendingUp, Wallet, HardHat, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface FinanceAnalysisRow {
  id: string
  reference: string | null
  analysis_type: string
  inputs?: Record<string, any> | null
  outputs: Record<string, any> | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  buyer_affordability: 'Affordability Assessment',
  investment_intelligence: 'Investment Intelligence',
  payment_plan: 'Payment Plan Intelligence',
  development_finance: 'Development Finance',
}

const TYPE_ICON: Record<string, typeof FileText> = {
  buyer_affordability: Wallet,
  investment_intelligence: TrendingUp,
  payment_plan: FileText,
  development_finance: HardHat,
}

function fmtNGN(n: number | null | undefined): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`
  return `₦${Math.round(n).toLocaleString()}`
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

// Each analysis_type's outputs JSON has a different shape (see
// lib/finance-intelligence.ts's own output interfaces) — this pulls the
// 2-3 figures worth headlining for each, rather than dumping raw JSON.
// Unknown/future types fall through to just reference + date, which is
// the honest thing to show rather than guessing at a shape.
function summarize(row: FinanceAnalysisRow): string {
  const o = row.outputs || {}
  if (row.analysis_type === 'buyer_affordability') {
    return `${o.ltv_pct != null ? `${Number(o.ltv_pct).toFixed(0)}% LTV` : ''}${o.indicative_monthly_repayment_ngn ? ` · ${fmtNGN(o.indicative_monthly_repayment_ngn)}/mo` : ''}`.trim() || 'Assessment saved'
  }
  if (row.analysis_type === 'investment_intelligence') {
    const verdict = o.verdict ? String(o.verdict).replace(/^./, (c: string) => c.toUpperCase()) : null
    return [
      verdict,
      o.gross_yield_pct != null ? `${Number(o.gross_yield_pct).toFixed(1)}% yield` : null,
      o.dscr != null ? `DSCR ${Number(o.dscr).toFixed(2)}x` : null,
    ].filter(Boolean).join(' · ') || 'Analysis saved'
  }
  // PHASE 5: Construction Appraisal runs (lib/construction-appraisal.ts,
  // via app/api/sites/[id]/appraisals/route.ts) now also save here.
  if (row.analysis_type === 'development_finance') {
    return [
      o.viability_label || null,
      o.residual_land_value_ngn != null ? `RLV ${fmtNGN(o.residual_land_value_ngn)}` : null,
    ].filter(Boolean).join(' · ') || 'Appraisal saved'
  }
  return 'Saved'
}


function CompareToggle({ row, dark }: { row: FinanceAnalysisRow; dark: boolean }) {
  const [open, setOpen] = useState(false)
  if (row.analysis_type !== 'buyer_affordability') return null
  return (
    <div style={{ width: '100%' }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ minHeight: 34, padding: '0.25rem 0.8rem', fontWeight: 700, marginTop: 6 }}>{open ? 'Hide mortgage comparison' : 'Compare mortgage options'}</button>
      {open && <MortgageComparePanel inputs={row.inputs ?? {}} outputs={row.outputs ?? {}} dark={dark} />}
    </div>
  )
}

export default function MyFinancePanel({ userId, dark }: { userId: string; dark: boolean }) {
  const [rows, setRows] = useState<FinanceAnalysisRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const loadFailed = !!loadError

  useEffect(() => {
    let mounted = true
    // Read through the server route: identity comes from the verified token, not from a client-supplied userId.
    ;(async () => {
      const token = await withTimeout(getAccessToken(), 8000, null)
      const r = await fetchJson('/api/finance-analyses', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!mounted) return
      if (!r.ok) { setLoadError(r.error || r.data?.error || 'Could not load your saved analyses.'); setRows([]); return }
      setRows(r.data?.analyses || [])
    })()
    return () => { mounted = false }
  }, [userId])

  const text    = dark ? '#F8FAFC' : '#0F172A'
  const text2   = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3   = dark ? 'rgba(248,250,252,0.4)'  : 'rgba(15,23,42,0.4)'
  const border  = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.1)'
  const cardBg  = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
  const purple  = '#5B2EFF'

  if (rows === null) {
    return <div style={{ fontSize: 13, color: text3, padding: '1rem 0' }}>Loading your saved analyses…</div>
  }

  return (
    <div>
      <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.6, marginBottom: 14, maxWidth: 640 }}>
        Every Affordability Assessment and Investment Intelligence run you've saved, with its MANOP
        reference. These are your own working analyses — not a MANOP or lender decision.
      </div>

      {loadFailed && (
        <div style={{ fontSize: 12, color: text3, marginBottom: 12, padding: '0.6rem 0.8rem', background: cardBg, border: `1px solid ${border}`, borderRadius: 8 }}>
          Couldn't load your saved analyses: {loadError}
        </div>
      )}

      {!loadFailed && rows.length === 0 && (
        <div style={{ textAlign: 'center' as const, padding: '2rem 1rem', color: text3, background: cardBg, border: `1px solid ${border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Nothing saved yet.</div>
          <Link href="/calculator" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: purple, color: '#fff', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Run Investment Intelligence <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {rows.map(row => {
        const Icon = TYPE_ICON[row.analysis_type] || FileText
        return (
          <div key={row.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '0.75rem 0.875rem', background: cardBg, border: `1px solid ${border}`,
            borderRadius: 10, marginBottom: 6, flexWrap: 'wrap' as const,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'rgba(91,46,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={15} color={purple} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: text }}>
                  {TYPE_LABEL[row.analysis_type] || row.analysis_type}
                </div>
                <div style={{ fontSize: 11.5, color: text3 }}>
                  {row.reference || 'No reference'} · {fmtDate(row.created_at)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: text2, textAlign: 'right' as const, flexShrink: 0 }}>
              {summarize(row)}
            </div>
            <CompareToggle row={row} dark={dark} />
          </div>
        )
      })}
    </div>
  )
}