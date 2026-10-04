'use client'
// components/FinancingModal.tsx
// "Get Financed" — appears on property listing pages and Reviewed
// Developments (via DevelopmentFinancingLauncher).
//
// FINANCE INTELLIGENCE PHASE 2: this used to be capture-only — it took the
// buyer's numbers and wrote straight to financing_requests with no
// calculation in between. It now runs a real Affordability Assessment
// (lib/finance-intelligence.ts) between the income step and submission:
// calculate → explain → save (finance_analyses) → optionally request
// (financing_requests, now linked to the analysis via finance_analysis_id).
//
// THEME RETROFIT (this pass): this modal was previously hardcoded
// dark-only — every color in the `css` template and the inline JSX
// styles was a fixed hex/rgba value, so it stayed dark even when the
// rest of the page (via DevelopmentFinancingLauncher's new `dark` prop)
// had switched to light. It now takes a `dark` prop and derives every
// color from lib/theme.ts's getDesignColors(dark), the same source the
// Reviewed Development page and Site Intelligence pages already use.
// `dark` defaults to true so any caller that hasn't been updated yet
// keeps the exact appearance it had before.

import { useState } from 'react'
import { Landmark, Building2, HardHat, Globe2, X, CheckCircle2 } from 'lucide-react'
import { sb } from '../lib/supabase/client'
import { getDesignColors } from '../lib/theme'
import { calculateAffordability, getFinanceSuitabilityLabel, type AffordabilityOutputs } from '../lib/finance-intelligence'

interface Props {
  propertyId?: string
  propertyAddress?: string
  estimatedPriceNgn: number
  onClose: () => void
  // Reviewed Developments context — when present, a Developer Installment
  // Plan choice routes to developer_leads (the same pipeline
  // DevelopmentEnquiryModal uses) instead of financing_requests, so it
  // reaches the developer's/agency's own dashboard through infrastructure
  // that already exists, rather than sitting in an admin-only inbox with
  // no owner. Omit all three when mounting on a resale listing — the
  // developer_plan path falls back to financing_requests in that case,
  // since there's no developer_id/project_id to route to.
  developerId?: string
  projectId?: string
  unitTypeId?: string | null
  dark?: boolean
}

type Step = 'type' | 'details' | 'income' | 'assessment' | 'confirm' | 'success'

// Rates marked "placeholder" have no specific source in MANOP's evidence —
// they're a starting point the buyer is expected to edit, not a MANOP claim
// about what they'll be offered. The NHF rate is the one exception: it's
// the published rate from the advisor pack's cited source (NiDCOM/FMBN,
// checked 15 Sep 2026) — still worth re-verifying before this ships, since
// public mortgage terms change and MANOP's own principle is to suppress
// stale rates rather than assert them as current indefinitely.
const FINANCING_TYPES = [
  {
    key: 'mortgage',
    label: 'Mortgage Loan',
    icon: Landmark,
    desc: 'Traditional bank mortgage — up to 20 years repayment. Best for salaried employees.',
    defaultRatePct: 22,
    rateIsPlaceholder: true,
  },
  {
    key: 'nhf',
    label: 'NHF / Federal Mortgage',
    icon: Building2,
    desc: 'National Housing Fund — lower rates. Available to NHF contributors.',
    defaultRatePct: 9,
    rateIsPlaceholder: false,
  },
  {
    key: 'developer_plan',
    label: 'Developer Installment Plan',
    icon: HardHat,
    desc: 'Pay in installments directly to the developer. No bank required.',
    defaultRatePct: null,
    rateIsPlaceholder: false,
  },
  {
    key: 'diaspora_remittance',
    label: 'Diaspora Financing',
    icon: Globe2,
    desc: 'Buying from abroad? We connect you with FX-ready financing partners.',
    defaultRatePct: 12,
    rateIsPlaceholder: true,
  },
]

export default function FinancingModal({
  propertyId, propertyAddress, estimatedPriceNgn, onClose, developerId, projectId, unitTypeId, dark = true,
}: Props) {
  const c = getDesignColors(dark)

  const [step, setStep]               = useState<Step>('type')
  const [financingType, setFT]        = useState('')
  const [form, setForm]               = useState({
    buyer_name: '', buyer_email: '', buyer_phone: '',
    buyer_city: '', is_diaspora: false, country_of_residence: '',
    loan_amount_requested: '', down_payment_ngn: '',
    tenure_months: '120', employment_status: '', monthly_income_range: '',
    has_existing_mortgage: false,
  })
  const [interestRatePct, setInterestRatePct] = useState('')
  const [assessment, setAssessment]   = useState<AffordabilityOutputs | null>(null)
  const [financeAnalysisId, setFinanceAnalysisId] = useState<string | null>(null)
  const [financeReference, setFinanceReference]   = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')

  const selectedType = FINANCING_TYPES.find(t => t.key === financingType)
  const runsAffordability = !!selectedType && selectedType.key !== 'developer_plan'

  function fmtNGN(n: number) {
    if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
    return `₦${n.toLocaleString()}`
  }

  function enterAssessment() {
    if (selectedType) setInterestRatePct(String(selectedType.defaultRatePct ?? ''))
    setStep('assessment')
  }

  function computeLive(): AffordabilityOutputs | null {
    const rate = parseFloat(interestRatePct)
    const depositNgn = form.down_payment_ngn ? parseInt(form.down_payment_ngn) * 1_000_000 : 0
    if (!estimatedPriceNgn || !rate || rate <= 0) return null
    return calculateAffordability({
      property_price_ngn: estimatedPriceNgn,
      deposit_available_ngn: depositNgn,
      fees_ngn: 0, // not collected yet — excludes legal/agency fees; shown as a caveat below
      interest_rate_pct: rate,
      loan_tenor_years: parseInt(form.tenure_months) / 12,
    })
  }

  async function saveAssessmentAndContinue() {
    const result = computeLive()
    if (!result) { setError('Enter a valid interest rate to see your affordability position.'); return }
    setError('')
    setSaving(true)

    const { data, error: dbError } = await sb.from('finance_analyses').insert({
      analysis_type: 'buyer_affordability',
      property_id: propertyId ?? null,
      inputs: {
        property_price_ngn: estimatedPriceNgn,
        deposit_available_ngn: form.down_payment_ngn ? parseInt(form.down_payment_ngn) * 1_000_000 : 0,
        interest_rate_pct: parseFloat(interestRatePct),
        loan_tenor_years: parseInt(form.tenure_months) / 12,
        financing_type: financingType,
      },
      outputs: result,
      input_provenance: 'user_stated',
    }).select('id, reference').single()

    setSaving(false)
    if (dbError) { setError('Could not save your assessment — you can still continue.'); }
    if (data) { setFinanceAnalysisId(data.id); setFinanceReference(data.reference) }

    setAssessment(result)
    setStep('confirm')
  }

  async function submit() {
    if (!form.buyer_name || !form.buyer_email || !form.buyer_phone || !form.buyer_city) {
      setError('Please fill all required fields.'); return
    }
    setSubmitting(true); setError('')

    // Developer Installment Plan on a Reviewed Development: this isn't a
    // mortgage MANOP helps route to a lender, it's the developer's own
    // payment plan — the developer is who should see it, through the same
    // pipeline "Enquire about this development" already uses, not a
    // separate financing_requests row admin has to manually forward.
    if (financingType === 'developer_plan' && projectId) {
      try {
        const res = await fetch('/api/developer-leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            developer_id: developerId || null,
            project_id: projectId,
            unit_type_id: unitTypeId || null,
            name: form.buyer_name.trim(),
            email: form.buyer_email.trim().toLowerCase() || null,
            phone: form.buyer_phone.trim() || null,
            country: form.is_diaspora ? form.country_of_residence : null,
            is_diaspora: form.is_diaspora,
            budget_usd: null, // priced in NGN here; leave unset rather than guess an FX rate
            unit_interest: unitTypeId || null,
            note: form.employment_status || form.monthly_income_range
              ? `Financing preference: developer installment plan. ${[form.employment_status, form.monthly_income_range].filter(Boolean).join(' · ')}`
              : 'Financing preference: developer installment plan.',
            source: 'manop_financing_developer_plan',
            country_code: 'NG',
          }),
        })
        const data = await res.json()
        setSubmitting(false)
        if (!res.ok) { setError(data.error || 'Submission failed. Please try again.'); return }
        setStep('success')
      } catch {
        setSubmitting(false)
        setError('Network error. Please try again.')
      }
      return
    }

    const { error: dbError } = await sb.from('financing_requests').insert({
      property_id:            propertyId ?? null,
      property_address:       propertyAddress ?? null,
      estimated_price_ngn:    estimatedPriceNgn,
      buyer_name:             form.buyer_name.trim(),
      buyer_email:            form.buyer_email.toLowerCase().trim(),
      buyer_phone:            form.buyer_phone.trim(),
      buyer_city:             form.buyer_city.trim(),
      is_diaspora:            form.is_diaspora,
      country_of_residence:   form.is_diaspora ? form.country_of_residence : null,
      financing_type:         financingType,
      loan_amount_requested:  form.loan_amount_requested ? parseInt(form.loan_amount_requested) * 1_000_000 : null,
      down_payment_ngn:       form.down_payment_ngn ? parseInt(form.down_payment_ngn) * 1_000_000 : null,
      tenure_months:          parseInt(form.tenure_months),
      employment_status:      form.employment_status || null,
      monthly_income_range:   form.monthly_income_range || null,
      has_existing_mortgage:  form.has_existing_mortgage,
      routing_city:           form.buyer_city.trim(),
      status:                 'submitted',
      finance_analysis_id:    financeAnalysisId, // links back to the saved assessment, if one was run
    })

    setSubmitting(false)
    if (dbError) { setError('Submission failed. Please try again.'); return }
    setStep('success')
  }

  // Every color below comes from getDesignColors(dark) — nothing here is
  // a fixed hex tied to one mode. Status colors (amber for "edit this",
  // teal for saved-reference, red for errors, green for success) keep
  // their semantic meaning across both themes, same as the rest of the app.
  const overlayBg   = dark ? 'rgba(0,0,0,0.78)' : 'rgba(15,23,42,0.45)'
  const inputBg     = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
  const hoverTint   = c.intelligencePurpleBg

  const css = `
    .fin-overlay {
      position: fixed; inset: 0; background: ${overlayBg};
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 24px; font-family: 'DM Sans', 'Inter', sans-serif;
    }
    .fin-modal {
      background: ${c.surfaceCard}; border: 1px solid ${c.border};
      border-radius: 18px; width: 520px; max-width: 100%;
      max-height: 90vh; overflow-y: auto;
    }
    .fin-header {
      padding: 24px 28px 20px;
      border-bottom: 1px solid ${c.border};
      display: flex; align-items: flex-start; justify-content: space-between;
    }
    .fin-title { font-size: 18px; font-weight: 800; color: ${c.textPrimary}; }
    .fin-sub { font-size: 12px; color: ${c.textMuted}; margin-top: 3px; }
    .fin-close {
      background: none; border: none; color: ${c.textMuted};
      cursor: pointer; padding: 4px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s;
    }
    .fin-close:hover { color: ${c.textPrimary}; }
    .fin-body { padding: 24px 28px; }
    .type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .type-card {
      background: ${c.surfaceCardHigh}; border: 2px solid ${c.border};
      border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.15s; text-align: left;
    }
    .type-card:hover { border-color: ${c.intelligencePurple}66; background: ${hoverTint}; }
    .type-card.selected { border-color: ${c.intelligencePurple}; background: ${hoverTint}; }
    .type-icon { color: ${c.intelligencePurple}; margin-bottom: 8px; }
    .type-label { font-size: 13px; font-weight: 700; color: ${c.textPrimary}; margin-bottom: 4px; }
    .type-desc { font-size: 11px; color: ${c.textMuted}; line-height: 1.5; }
    .inp {
      background: ${inputBg}; border: 1px solid ${c.border};
      border-radius: 8px; padding: 10px 13px; font-size: 13px; color: ${c.textPrimary};
      font-family: inherit; width: 100%; transition: border-color 0.15s;
    }
    .inp:focus { outline: none; border-color: ${c.intelligencePurple}; }
    .lbl { font-size: 10px; font-weight: 700; color: ${c.textMuted}; letter-spacing: 0.06em; text-transform: uppercase; display: block; margin-bottom: 5px; }
    .fg { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .fgg { margin-bottom: 14px; }
    select.inp { appearance: none; cursor: pointer; }
    .btn-row { display: flex; gap: 10px; margin-top: 20px; }
    .btn-p { background: ${c.intelligencePurple}; color: white; border: none; border-radius: 9px; padding: 11px 22px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
    .btn-p:hover { opacity: 0.88; }
    .btn-p:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-g { background: transparent; color: ${c.textMuted}; border: 1px solid ${c.border}; border-radius: 9px; padding: 11px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .btn-g:hover { color: ${c.textPrimary}; }
    .price-box { background: ${c.intelligencePurpleBg}; border: 1px solid ${c.intelligencePurple}40; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
    .price-label { font-size: 10px; font-weight: 700; color: ${c.textPrimary}; opacity: 0.75; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
    .price-value { font-size: 22px; font-weight: 800; color: ${c.textPrimary} !important; }
    .err { background: ${c.statusRedBg}; border: 1px solid ${c.statusRed}4D; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: ${c.statusRed}; margin-bottom: 14px; }
    .check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${c.textMuted}; cursor: pointer; margin-bottom: 12px; }
    .progress { display: flex; gap: 6px; margin-bottom: 20px; }
    .prog-dot { width: 6px; height: 6px; border-radius: 50%; background: ${c.border}; transition: background 0.15s; }
    .prog-dot.done { background: ${c.intelligencePurple}; }
    .success-icon {
      color: #22C55E; margin-bottom: 16px;
      display: flex; align-items: center; justify-content: center;
    }
  `

  const stepIndex = { type: 0, details: 1, income: 2, assessment: 3, confirm: 4, success: 5 }
  const currentStep = stepIndex[step]

  return (
    <>
      <style>{css}</style>
      <div className="fin-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="fin-modal">
          <div className="fin-header">
            <div>
              <div className="fin-title">Property Financing</div>
              <div className="fin-sub">Connect with financing partners in your city</div>
            </div>
            <button className="fin-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>

          <div className="fin-body">

            {/* Progress dots */}
            {step !== 'success' && (
              <div className="progress">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className={`prog-dot ${i <= currentStep ? 'done' : ''}`} />
                ))}
              </div>
            )}

            {/* Property price */}
            {step !== 'success' && (
              <div className="price-box">
                <div className="price-label">Property Value</div>
                <div className="price-value">{fmtNGN(estimatedPriceNgn)}</div>
              </div>
            )}

            {/* Step 1: Financing Type */}
            {step === 'type' && (
              <>
                <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 16 }}>
                  What type of financing are you looking for?
                </div>
                <div className="type-grid">
                  {FINANCING_TYPES.map(t => {
                    const Icon = t.icon
                    return (
                      <button key={t.key} className={`type-card ${financingType === t.key ? 'selected' : ''}`}
                        onClick={() => setFT(t.key)}>
                        <div className="type-icon"><Icon size={22} /></div>
                        <div className="type-label">{t.label}</div>
                        <div className="type-desc">{t.desc}</div>
                      </button>
                    )
                  })}
                </div>
                <div className="btn-row">
                  <button className="btn-p" onClick={() => setStep('details')} disabled={!financingType}>
                    Continue →
                  </button>
                  <button className="btn-g" onClick={onClose}>Cancel</button>
                </div>
              </>
            )}

            {/* Step 2: Buyer Details */}
            {step === 'details' && (
              <>
                <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 16 }}>
                  Your contact details
                </div>
                <div className="fg">
                  <div>
                    <label className="lbl">Full Name *</label>
                    <input className="inp" placeholder="John Adeyemi" value={form.buyer_name} onChange={e => setForm(p => ({ ...p, buyer_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="lbl">City *</label>
                    <input className="inp" placeholder="Lagos" value={form.buyer_city} onChange={e => setForm(p => ({ ...p, buyer_city: e.target.value }))} />
                  </div>
                </div>
                <div className="fg">
                  <div>
                    <label className="lbl">Email *</label>
                    <input className="inp" type="email" placeholder="john@email.com" value={form.buyer_email} onChange={e => setForm(p => ({ ...p, buyer_email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="lbl">Phone *</label>
                    <input className="inp" placeholder="+234 800 000 0000" value={form.buyer_phone} onChange={e => setForm(p => ({ ...p, buyer_phone: e.target.value }))} />
                  </div>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={form.is_diaspora} onChange={e => setForm(p => ({ ...p, is_diaspora: e.target.checked }))} />
                  I am buying from abroad (diaspora)
                </label>
                {form.is_diaspora && (
                  <div className="fgg">
                    <label className="lbl">Country of Residence</label>
                    <input className="inp" placeholder="United Kingdom" value={form.country_of_residence} onChange={e => setForm(p => ({ ...p, country_of_residence: e.target.value }))} />
                  </div>
                )}
                <div className="btn-row">
                  <button className="btn-p" onClick={() => setStep('income')}>Continue →</button>
                  <button className="btn-g" onClick={() => setStep('type')}>← Back</button>
                </div>
              </>
            )}

            {/* Step 3: Financial Details */}
            {step === 'income' && (
              <>
                <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 16 }}>
                  Financing details (helps us match you to the right partner)
                </div>
                <div className="fg">
                  <div>
                    <label className="lbl">Loan Amount Needed (₦M)</label>
                    <input className="inp" type="number" placeholder="e.g. 25" value={form.loan_amount_requested} onChange={e => setForm(p => ({ ...p, loan_amount_requested: e.target.value }))} />
                  </div>
                  <div>
                    <label className="lbl">Down Payment Available (₦M)</label>
                    <input className="inp" type="number" placeholder="e.g. 5" value={form.down_payment_ngn} onChange={e => setForm(p => ({ ...p, down_payment_ngn: e.target.value }))} />
                  </div>
                </div>
                <div className="fg">
                  <div>
                    <label className="lbl">Preferred Tenure</label>
                    <select className="inp" value={form.tenure_months} onChange={e => setForm(p => ({ ...p, tenure_months: e.target.value }))}>
                      <option value="60">5 years</option>
                      <option value="120">10 years</option>
                      <option value="180">15 years</option>
                      <option value="240">20 years</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Employment Status</label>
                    <select className="inp" value={form.employment_status} onChange={e => setForm(p => ({ ...p, employment_status: e.target.value }))}>
                      <option value="">Select…</option>
                      <option value="employed">Salaried employee</option>
                      <option value="self_employed">Self-employed</option>
                      <option value="business_owner">Business owner</option>
                      <option value="diaspora">Diaspora</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>
                </div>
                <div className="fgg">
                  <label className="lbl">Monthly Income Range</label>
                  <select className="inp" value={form.monthly_income_range} onChange={e => setForm(p => ({ ...p, monthly_income_range: e.target.value }))}>
                    <option value="">Prefer not to say</option>
                    <option value="below_500k">Below ₦500,000</option>
                    <option value="500k_1m">₦500,000 – ₦1M</option>
                    <option value="1m_3m">₦1M – ₦3M</option>
                    <option value="3m_5m">₦3M – ₦5M</option>
                    <option value="above_5m">Above ₦5M</option>
                  </select>
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={form.has_existing_mortgage} onChange={e => setForm(p => ({ ...p, has_existing_mortgage: e.target.checked }))} />
                  I currently have an existing mortgage
                </label>
                <div className="btn-row">
                  <button className="btn-p" onClick={() => runsAffordability ? enterAssessment() : setStep('confirm')}>
                    {runsAffordability ? 'See my affordability →' : 'Review →'}
                  </button>
                  <button className="btn-g" onClick={() => setStep('details')}>← Back</button>
                </div>
              </>
            )}

            {/* Step 3.5: Affordability Assessment — the calculation this modal
                previously skipped straight past. Runs lib/finance-intelligence's
                calculateAffordability on what the buyer already entered, shows
                the result before anything is submitted, and saves it as a
                finance_analyses record the buyer can trace back to later. */}
            {step === 'assessment' && (() => {
              const live = computeLive()
              const label = live ? getFinanceSuitabilityLabel(live.ltv_pct) : null
              return (
                <>
                  <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 16 }}>
                    Your affordability position — based on what you've entered, not a lender decision.
                  </div>
                  <div className="fg">
                    <div>
                      <label className="lbl">Down payment (₦M)</label>
                      <input className="inp" type="number" placeholder="e.g. 5" value={form.down_payment_ngn} onChange={e => setForm(p => ({ ...p, down_payment_ngn: e.target.value }))} />
                    </div>
                    <div>
                      <label className="lbl">
                        Interest rate assumption (% p.a.)
                        {selectedType?.rateIsPlaceholder && <span style={{ color: c.statusAmber, fontWeight: 400, textTransform: 'none' as const }}> — edit to your actual quote</span>}
                      </label>
                      <input className="inp" type="number" step="0.1" value={interestRatePct} onChange={e => setInterestRatePct(e.target.value)} />
                    </div>
                  </div>

                  {live ? (
                    <div style={{ background: c.intelligencePurpleBg, border: `1px solid ${c.intelligencePurple}40`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Mortgage requirement</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.mortgage_requirement_ngn)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Indicative LTV</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{live.ltv_pct.toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Indicative monthly repayment</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.indicative_monthly_repayment_ngn)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Cash required now</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.cash_requirement_ngn)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c.verificationTeal }}>{label}</div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                        Excludes legal and agency fees. This is your own working analysis, not a MANOP or lender decision — final terms depend on lender underwriting, valuation and your eligibility.
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 16 }}>
                      Enter a down payment and an interest rate to see your affordability position.
                    </div>
                  )}

                  {error && <div className="err">{error}</div>}

                  <div className="btn-row">
                    <button className="btn-p" onClick={saveAssessmentAndContinue} disabled={saving || !live}>
                      {saving ? 'Saving…' : 'Save & review request →'}
                    </button>
                    <button className="btn-g" onClick={() => setStep('income')}>← Back</button>
                  </div>
                </>
              )
            })()}

            {/* Step 4: Confirm */}
            {step === 'confirm' && (
              <>
                <div style={{ fontSize: 13, color: c.textPrimary, opacity: 0.85, marginBottom: 16, fontWeight: 600 }}>
                  Review your financing request before submitting.
                </div>
                {financeReference && (
                  <div style={{ fontSize: 11, color: c.verificationTeal, marginBottom: 10 }}>
                    Affordability assessment saved as {financeReference}
                  </div>
                )}
                {[
                  { label: 'Name', value: form.buyer_name },
                  { label: 'Email', value: form.buyer_email },
                  { label: 'Phone', value: form.buyer_phone },
                  { label: 'City', value: form.buyer_city },
                  { label: 'Financing type', value: FINANCING_TYPES.find(t => t.key === financingType)?.label ?? financingType },
                  { label: 'Loan needed', value: form.loan_amount_requested ? `₦${form.loan_amount_requested}M` : '—' },
                  { label: 'Down payment', value: form.down_payment_ngn ? `₦${form.down_payment_ngn}M` : '—' },
                  { label: 'Tenure', value: `${parseInt(form.tenure_months) / 12} years` },
                  ...(assessment ? [
                    { label: 'Indicative LTV', value: `${assessment.ltv_pct.toFixed(0)}%` },
                    { label: 'Indicative monthly repayment', value: fmtNGN(assessment.indicative_monthly_repayment_ngn) },
                  ] : []),
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: `1px solid ${c.border}`,
                    fontSize: 13,
                  }}>
                    <span style={{ color: c.textMuted, fontSize: 12 }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: c.textPrimary }}>{row.value}</span>
                  </div>
                ))}

                <div style={{ background: c.verificationTealBg, border: `1px solid ${c.verificationTeal}4D`, borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: 12, color: c.textPrimary, opacity: 0.9, lineHeight: 1.7 }}>
                  After submitting, MANOP will review your request and connect you with the most suitable financing partner in {form.buyer_city}. You will receive an email within 1-2 business days.
                </div>

                {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}

                <div className="btn-row">
                  <button className="btn-p" onClick={submit} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit Request'}
                  </button>
                  <button className="btn-g" onClick={() => setStep(runsAffordability ? 'assessment' : 'income')}>← Back</button>
                </div>
              </>
            )}

            {/* Step 5: Success */}
            {step === 'success' && (
              <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
                <div className="success-icon"><CheckCircle2 size={30} /></div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.textPrimary, marginBottom: 10 }}>Request submitted</div>
                <div style={{ fontSize: 13, color: c.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
                  We'll review your request and connect you with a financing partner in <strong style={{ color: c.textPrimary }}>{form.buyer_city}</strong> within 1-2 business days.<br /><br />
                  Check your email at <strong style={{ color: c.textPrimary }}>{form.buyer_email}</strong> for next steps.
                </div>
                <button className="btn-p" onClick={onClose}>Done</button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}