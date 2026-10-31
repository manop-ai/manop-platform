'use client'
// components/LenderProductsPanel.tsx
//
// The Admin -> Lender Products tab (it replaces the inline block that lived in app/admin/page.tsx; same tab, same
// data, same API routes: no second register). It uses the admin page's own scoped styles (#admin-root).
//
// What it shows an admin: which products are eligible for buyer comparison, which are stale, awaiting confirmation,
// missing criteria or due for follow-up; how each was evidenced (researched / third-party / provider-confirmed);
// and lets them add, edit, re-verify, withdraw and reactivate. Nothing here makes a product a "confirmed financing
// option": the Evidence column says how MANOP knows it.

import { useMemo, useState } from 'react'
import { RefreshCw, Archive, Pencil } from 'lucide-react'
import {
  STALENESS_THRESHOLD_DAYS, VERIFICATION_LABEL, VERIFICATION_STATUSES, verificationState, daysSinceVerified,
  matchingEligibility, missingCriteria, type FinanceProduct, type VerificationStatus,
} from '../lib/finance-products'
import { fetchJson } from '../lib/fetch-json'

const TYPES: { v: FinanceProduct['product_type']; l: string }[] = [
  { v: 'mortgage', l: 'Mortgage' }, { v: 'nhf', l: 'NHF / Federal Mortgage' },
  { v: 'diaspora_remittance', l: 'Diaspora Remittance' }, { v: 'developer_plan', l: 'Developer Installment Plan' },
]
const EMPLOYMENT = [
  { v: 'employed', l: 'Salaried employee' }, { v: 'self_employed', l: 'Self-employed' }, { v: 'business_owner', l: 'Business owner' },
  { v: 'diaspora', l: 'Diaspora' }, { v: 'retired', l: 'Retired' },
]
const RESIDENCY = [{ v: 'resident', l: 'Resident in country' }, { v: 'diaspora', l: 'Diaspora' }]
const today = () => new Date().toISOString().slice(0, 10)

const blank = () => ({
  lender_name: '', product_name: '', product_type: 'mortgage' as FinanceProduct['product_type'], country_code: 'NG', currency_code: 'NGN',
  description: '', application_channel: '',
  coverage_scope: 'unknown' as 'nationwide' | 'cities' | 'unknown', cities_covered: '',
  min_rate_pct: '', max_rate_pct: '', rate_type: 'unknown', max_ltv_pct: '', min_deposit_pct: '',
  min_tenor_years: '', max_tenor_years: '', min_monthly_income_ngn: '', min_loan_amount_ngn: '', max_loan_amount_ngn: '',
  fees_notes: '', repayment_structure: '',
  allowed_employment: [] as string[], allowed_residency: [] as string[], income_currencies: '',
  employment_notes: '', property_eligibility: '', required_documents: '', eligibility_notes: '',
  source_name: '', source_url: '', source_date: '', last_verified_at: today(), verification_status: 'researched_public' as VerificationStatus,
  internal_notes: '', follow_up_owner: '', next_follow_up_at: '',
})
type Form = ReturnType<typeof blank>

function fromProduct(p: FinanceProduct): Form {
  const s = (v: unknown) => (v == null ? '' : String(v))
  return {
    lender_name: p.lender_name, product_name: p.product_name, product_type: p.product_type, country_code: p.country_code, currency_code: s(p.currency_code) || 'NGN',
    description: s(p.description), application_channel: s(p.application_channel),
    coverage_scope: (p.coverage_scope ?? (p.cities_covered?.length ? 'cities' : 'unknown')) as Form['coverage_scope'], cities_covered: (p.cities_covered ?? []).join(', '),
    min_rate_pct: s(p.min_rate_pct), max_rate_pct: s(p.max_rate_pct), rate_type: s(p.rate_type) || 'unknown', max_ltv_pct: s(p.max_ltv_pct), min_deposit_pct: s(p.min_deposit_pct),
    min_tenor_years: s(p.min_tenor_years), max_tenor_years: s(p.max_tenor_years), min_monthly_income_ngn: s(p.min_monthly_income_ngn),
    min_loan_amount_ngn: s(p.min_loan_amount_ngn), max_loan_amount_ngn: s(p.max_loan_amount_ngn),
    fees_notes: s(p.fees_notes), repayment_structure: s(p.repayment_structure),
    allowed_employment: p.allowed_employment ?? [], allowed_residency: p.allowed_residency ?? [], income_currencies: (p.income_currencies ?? []).join(', '),
    employment_notes: s(p.employment_notes), property_eligibility: s(p.property_eligibility), required_documents: s(p.required_documents), eligibility_notes: s(p.eligibility_notes),
    source_name: p.source_name, source_url: s(p.source_url), source_date: s(p.source_date), last_verified_at: (p.last_verified_at || '').slice(0, 10), verification_status: (p.verification_status ?? 'researched_public') as VerificationStatus,
    internal_notes: s(p.internal_notes), follow_up_owner: s(p.follow_up_owner), next_follow_up_at: s(p.next_follow_up_at),
  }
}

// Empty box = "not recorded" (null), never zero.
const toBody = (f: Form) => ({
  ...f,
  income_currencies: f.income_currencies,
  allowed_employment: f.allowed_employment.length ? f.allowed_employment : null,
  allowed_residency: f.allowed_residency.length ? f.allowed_residency : null,
  rate_type: f.rate_type || null,
})

export interface LenderProductsPanelProps {
  products: FinanceProduct[]
  loadState: 'idle' | 'loading' | 'error'
  loadError: string
  reload: () => Promise<void> | void
  getToken: () => Promise<string>
}

export default function LenderProductsPanel({ products, loadState, loadError, reload, getToken }: LenderProductsPanelProps) {
  const [form, setForm] = useState<Form>(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [reverify, setReverify] = useState<{ id: string; date: string; status: string; note: string } | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }))
  const toggle = (k: 'allowed_employment' | 'allowed_residency', v: string) =>
    setForm(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))

  const summary = useMemo(() => {
    const active = products.filter(p => p.status === 'active')
    return {
      eligible: active.filter(p => matchingEligibility(p).eligible).length,
      stale: active.filter(p => ['stale', 'invalid', 'future'].includes(verificationState(p.last_verified_at))).length,
      awaiting: active.filter(p => p.verification_status === 'awaiting_confirmation').length,
      missing: active.filter(p => missingCriteria(p).length > 0).length,
      followUp: active.filter(p => p.verification_status !== 'provider_confirmed' || (p.next_follow_up_at && p.next_follow_up_at <= today())).length,
      withdrawn: products.length - active.length,
    }
  }, [products])

  async function call(url: string, method: 'POST' | 'PATCH', body: unknown) {
    const token = await getToken()
    if (!token) return { ok: false, error: 'Your session could not be read. Sign in again, then retry.', data: null as any }
    return fetchJson(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  }

  async function submit() {
    setMsg(null); setBusy(true)
    try {
      const r = editingId
        ? await call(`/api/admin/finance-products/${editingId}`, 'PATCH', { action: 'update', fields: toBody(form) })
        : await call('/api/admin/finance-products', 'POST', toBody(form))
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return }
      setMsg({ ok: true, text: (editingId ? 'Product updated.' : 'Product recorded.') + (r.data?.warning ? ` ${r.data.warning}` : '') + (r.data?.audit === 'unavailable' ? ' (The verification trail could not be written; see sql/phase17.)' : '') })
      setForm(blank()); setEditingId(null)
      await reload()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save this product.' })
    } finally { setBusy(false) }
  }

  async function act(id: string, body: Record<string, unknown>) {
    setMsg(null)
    const r = await call(`/api/admin/finance-products/${id}`, 'PATCH', body)
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return false }
    await reload(); return true
  }

  const num = (k: keyof Form, label: string, step?: string) => (
    <div className="fgg"><label className="lbl">{label}</label>
      <input className="inp" type="number" step={step} value={form[k] as string} onChange={e => set(k, e.target.value as any)} /></div>
  )
  const txt = (k: keyof Form, label: string, ph?: string) => (
    <div className="fgg"><label className="lbl">{label}</label>
      <input className="inp" placeholder={ph} value={form[k] as string} onChange={e => set(k, e.target.value as any)} /></div>
  )
  const area = (k: keyof Form, label: string) => (
    <div className="fgg"><label className="lbl">{label}</label>
      <textarea className="inp" rows={2} value={form[k] as string} onChange={e => set(k, e.target.value as any)} /></div>
  )

  const stat = (n: number, l: string, tone?: string) => (
    <div className="card" style={{ flex: '1 1 130px', padding: '10px 12px', marginBottom: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone || 'var(--text)' }}>{n}</div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{l}</div>
    </div>
  )

  return (
    <>
      <div className="info-box">
        <strong style={{ color: 'var(--text)' }}>A product is evidence MANOP has gathered, not a lender&apos;s confirmation.</strong><br />
        Every product needs a source and a verification date. {STALENESS_THRESHOLD_DAYS} days since last verification is MANOP&apos;s own
        re-verification policy (not a lender expiry): after that, a product is withdrawn from buyer comparison until re-verified. A blank criterion means
        <em> not recorded</em>, and is never treated as &ldquo;no restriction&rdquo;. Recorded criteria are not lender approval.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {stat(summary.eligible, 'Eligible for buyer comparison', '#22c55e')}
        {stat(summary.stale, 'Stale or invalid date', summary.stale ? '#f59e0b' : undefined)}
        {stat(summary.awaiting, 'Awaiting confirmation')}
        {stat(summary.missing, 'With missing criteria')}
        {stat(summary.followUp, 'Need follow-up')}
        {stat(summary.withdrawn, 'Withdrawn')}
      </div>

      {msg && <div className={msg.ok ? 'msg-ok' : 'msg-er'}>{msg.text}</div>}

      <div className="card">
        <div className="card-title">{editingId ? 'Edit lender product' : 'Add a lender product'}</div>

        <div className="lbl" style={{ margin: '4px 0 8px' }}>Provider and product</div>
        <div className="fg">{txt('lender_name', 'Provider / lender *', 'e.g. First Bank Nigeria')}{txt('product_name', 'Product name *', 'e.g. MREIF Home Loan')}</div>
        <div className="fg">
          <div className="fgg"><label className="lbl">Type *</label>
            <select className="inp" value={form.product_type} onChange={e => set('product_type', e.target.value as any)}>
              {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select></div>
          {txt('currency_code', 'Currency', 'NGN')}
        </div>
        {area('description', 'Official product description')}
        {txt('application_channel', 'Application / contact channel (as published)')}

        <div className="lbl" style={{ margin: '12px 0 8px' }}>Where it is available</div>
        <div className="fg">
          <div className="fgg"><label className="lbl">Coverage</label>
            <select className="inp" value={form.coverage_scope} onChange={e => set('coverage_scope', e.target.value as any)}>
              <option value="unknown">Not recorded</option><option value="nationwide">Nationwide (the source says so)</option><option value="cities">Listed cities only</option>
            </select></div>
          {form.coverage_scope === 'cities' && txt('cities_covered', 'Cities (comma-separated)', 'Lagos, Abuja')}
        </div>

        <div className="lbl" style={{ margin: '12px 0 8px' }}>Financial criteria (leave blank if not published)</div>
        <div className="fg">{num('min_rate_pct', 'Min interest rate %', '0.01')}{num('max_rate_pct', 'Max interest rate %', '0.01')}</div>
        <div className="fg">
          <div className="fgg"><label className="lbl">Rate type</label>
            <select className="inp" value={form.rate_type} onChange={e => set('rate_type', e.target.value)}>
              <option value="unknown">Not recorded</option><option value="fixed">Fixed</option><option value="variable">Variable</option>
            </select></div>
          {num('max_ltv_pct', 'Max LTV %')}
        </div>
        <div className="fg">{num('min_deposit_pct', 'Min deposit / equity %')}{num('min_monthly_income_ngn', 'Min monthly income (₦)')}</div>
        <div className="fg">{num('min_loan_amount_ngn', 'Min loan amount (₦)')}{num('max_loan_amount_ngn', 'Max loan amount (₦)')}</div>
        <div className="fg">{num('min_tenor_years', 'Min tenor (years)')}{num('max_tenor_years', 'Max tenor (years)')}</div>
        {area('fees_notes', 'Documented fees and other material costs')}
        {area('repayment_structure', 'Repayment structure (as published)')}

        <div className="lbl" style={{ margin: '12px 0 8px' }}>Eligibility (only what the provider publishes)</div>
        <div className="fgg"><label className="lbl">Employment types allowed</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
            {EMPLOYMENT.map(o => <label key={o.v} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={form.allowed_employment.includes(o.v)} onChange={() => toggle('allowed_employment', o.v)} />{o.l}</label>)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>None ticked = not recorded (not &ldquo;anyone&rdquo;).</div></div>
        <div className="fgg"><label className="lbl">Residency allowed</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
            {RESIDENCY.map(o => <label key={o.v} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={form.allowed_residency.includes(o.v)} onChange={() => toggle('allowed_residency', o.v)} />{o.l}</label>)}
          </div></div>
        {txt('income_currencies', 'Income currencies accepted (comma-separated)', 'NGN')}
        {area('employment_notes', 'Employment / salary conditions (as published)')}
        {area('property_eligibility', 'Property and development conditions (not assessed against a buyer’s property by MANOP)')}
        {area('required_documents', 'Required applicant documents')}
        {area('eligibility_notes', 'Other published eligibility notes')}

        <div className="highlight-field">
          <label className="lbl" style={{ color: 'var(--accent)' }}>Evidence: required</label>
          <div className="fg" style={{ marginBottom: 10 }}>{txt('source_name', 'Source *', 'e.g. First Bank MREIF product page')}{txt('source_url', 'Source URL', 'https://…')}</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fgg"><label className="lbl">Source date (if shown)</label><input className="inp" type="date" value={form.source_date} onChange={e => set('source_date', e.target.value)} /></div>
            <div className="fgg"><label className="lbl">Date MANOP checked it *</label><input className="inp" type="date" max={today()} value={form.last_verified_at} onChange={e => set('last_verified_at', e.target.value)} /></div>
          </div>
          <div className="fgg"><label className="lbl">How MANOP knows this</label>
            <select className="inp" value={form.verification_status} onChange={e => set('verification_status', e.target.value as VerificationStatus)}>
              {VERIFICATION_STATUSES.map(s => <option key={s} value={s}>{VERIFICATION_LABEL[s]}</option>)}
            </select></div>
        </div>

        <div className="lbl" style={{ margin: '4px 0 8px' }}>Internal (never shown to buyers)</div>
        <div className="fg">{txt('follow_up_owner', 'Responsible follow-up person')}
          <div className="fgg"><label className="lbl">Next follow-up</label><input className="inp" type="date" value={form.next_follow_up_at} onChange={e => set('next_follow_up_at', e.target.value)} /></div></div>
        {area('internal_notes', 'Internal notes')}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-p" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add product'}</button>
          {editingId && <button className="btn btn-g" onClick={() => { setEditingId(null); setForm(blank()); setMsg(null) }}>Cancel edit</button>}
        </div>
      </div>

      <div className="tbl">
        <div className="tbl-hd"><span className="tbl-title">Lender Products</span><span className="tbl-count">{products.length} total</span></div>
        {loadState === 'error' ? (
          <div className="empty">Couldn&apos;t load lender products. {loadError}</div>
        ) : loadState === 'loading' && products.length === 0 ? (
          <div className="empty">Loading…</div>
        ) : products.length === 0 ? (
          <div className="empty">No lender products added yet. Finance Suitability matching has nothing to compare a buyer&apos;s numbers against until one exists here.</div>
        ) : (
          <table>
            <thead><tr><th>Lender / Product</th><th>Type</th><th>Recorded criteria</th><th>Evidence</th><th>Buyer comparison</th><th>Action</th></tr></thead>
            <tbody>
              {products.map(p => {
                const elig = matchingEligibility(p)
                const state = verificationState(p.last_verified_at)
                const days = daysSinceVerified(p.last_verified_at)
                const missing = missingCriteria(p)
                const dateText = state === 'invalid' ? 'Date missing or invalid' : new Date(p.last_verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                const showRv = reverify?.id === p.id
                return (
                  <tr key={p.id}>
                    <td><div style={{ fontWeight: 700, color: 'var(--text)' }}>{p.lender_name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.product_name}</div></td>
                    <td style={{ fontSize: 11 }}>{TYPES.find(t => t.v === p.product_type)?.l ?? p.product_type}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {[
                        p.max_rate_pct != null ? `${p.min_rate_pct != null && p.min_rate_pct !== p.max_rate_pct ? `${p.min_rate_pct}–` : ''}${p.max_rate_pct}%` : null,
                        p.max_ltv_pct != null ? `${p.max_ltv_pct}% max LTV` : null,
                        p.max_tenor_years != null ? `${p.max_tenor_years}y max` : null,
                        p.max_loan_amount_ngn != null ? `up to ₦${Number(p.max_loan_amount_ngn).toLocaleString()}` : null,
                      ].filter(Boolean).join(' · ') || 'None recorded'}
                      {missing.length > 0 && <div style={{ color: '#f59e0b', marginTop: 2 }}>Missing: {missing.join(', ')}</div>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                      <div>{p.verification_status ? VERIFICATION_LABEL[p.verification_status] : 'Source recorded (type not stated)'}</div>
                      <div>{p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{p.source_name}</a> : p.source_name}</div>
                      <div className="mono" style={{ color: state === 'current' ? 'var(--muted)' : '#f59e0b' }}>
                        Checked {dateText}{days != null && state !== 'invalid' ? ` (${days}d ago)` : ''}{state === 'stale' && ' · stale'}{state === 'future' && ' · future date'}
                      </div>
                      {p.follow_up_owner && <div>Follow-up: {p.follow_up_owner}{p.next_follow_up_at ? `, ${p.next_follow_up_at}` : ''}</div>}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {p.status === 'withdrawn' ? <span style={{ color: 'var(--muted)' }}>Withdrawn</span>
                        : elig.eligible ? <span style={{ color: '#22c55e' }}>Included{p.verification_status !== 'provider_confirmed' ? ' (provider has not confirmed)' : ''}</span>
                        : <span style={{ color: '#f59e0b' }}>Excluded: {elig.reason}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.status === 'active' && <button className="btn btn-ok btn-sm" title="Re-verify" onClick={() => setReverify(showRv ? null : { id: p.id, date: today(), status: '', note: '' })}><RefreshCw size={11} /></button>}
                        <button className="btn btn-g btn-sm" title="Edit" onClick={() => { setEditingId(p.id); setForm(fromProduct(p)); setMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Pencil size={11} /></button>
                        {p.status === 'active' && <button className="btn btn-er btn-sm" title="Withdraw" onClick={() => act(p.id, { action: 'withdraw' })}><Archive size={11} /></button>}
                        {p.status === 'withdrawn' && <button className="btn btn-g btn-sm" onClick={() => act(p.id, { action: 'reactivate' })}>Reactivate</button>}
                      </div>
                      {showRv && reverify && (
                        <div style={{ marginTop: 8, display: 'grid', gap: 6, minWidth: 220 }}>
                          <label className="lbl">Date checked</label>
                          <input className="inp" type="date" max={today()} value={reverify.date} onChange={e => setReverify({ ...reverify, date: e.target.value })} />
                          <label className="lbl">How (leave as is to keep the current classification)</label>
                          <select className="inp" value={reverify.status} onChange={e => setReverify({ ...reverify, status: e.target.value })}>
                            <option value="">Keep current</option>
                            {VERIFICATION_STATUSES.map(s => <option key={s} value={s}>{VERIFICATION_LABEL[s]}</option>)}
                          </select>
                          <input className="inp" placeholder="Note (what was checked)" value={reverify.note} onChange={e => setReverify({ ...reverify, note: e.target.value })} />
                          <button className="btn btn-p btn-sm" onClick={async () => {
                            const ok = await act(p.id, { action: 'reverify', verified_at: reverify.date, note: reverify.note, ...(reverify.status ? { verification_status: reverify.status } : {}) })
                            if (ok) setReverify(null)
                          }}>Record verification</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}