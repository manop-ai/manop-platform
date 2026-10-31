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

import { useState, useEffect, useMemo } from 'react'
import { Landmark, Building2, HardHat, Globe2, X, CheckCircle2 } from 'lucide-react'
import { sb } from '../lib/supabase/client'
import { getDesignColors } from '../lib/theme'
import {
  calculateAffordability, getFinanceSuitabilityLabel, calculateUnitPaymentPlan, describeUnitPaymentTerms,
  validateAffordabilityInputs, AFFORDABILITY_ASSUMPTIONS, type AffordabilityOutputs,
} from '../lib/finance-intelligence'
import { VERDICT_LABEL, type ProductMatch } from '../lib/finance-products'
import { saveFinanceAnalysis } from '../lib/save-finance-analysis'
import { summariseAffordability } from '../lib/finance-analysis'
import { ConsentCheckbox, EvidenceTag } from './DesignSystem'
import {
  describeUnit, priceLine, PURPOSE_LABEL, REQUEST_PURPOSES, purposeNeedsFinancing,
  type UnitRow, type RequestPurpose,
} from '../lib/unit-selection'

interface Props {
  propertyId?: string
  propertyAddress?: string
  // Legacy single-price mode (no unit list). Kept so any caller without units still works.
  estimatedPriceNgn?: number
  // The development's own unit rows. When present the buyer must CHOOSE the unit; the price used
  // everywhere below is that unit's own price, never the first row's.
  units?: UnitRow[]
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
  // Real Payment Plan Intelligence terms for this unit (Phase 4) — when
  // present, the Developer Installment Plan step shows the unit's actual
  // deposit/installment burden instead of generic mortgage-flavored
  // fields (loan amount, tenure) that never applied to an installment
  // plan in the first place. Omit when mounting outside a Reviewed
  // Development, or when the unit hasn't had these fields set yet — the
  // step then falls back to the original generic fields.
  unitDepositPct?: number | null
  unitInstallmentMonths?: number | null
  dark?: boolean
}

type Step = 'unit' | 'type' | 'details' | 'income' | 'assessment' | 'confirm' | 'success'

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
  propertyId, propertyAddress, estimatedPriceNgn, units, onClose, developerId, projectId, unitTypeId, dark = true,
  unitDepositPct, unitInstallmentMonths,
}: Props) {
  const c = getDesignColors(dark)

  // Unit mode: the buyer picks the unit and the request type before anything else.
  // Nothing defaults to the first unit. A single-unit development pre-selects its one unit,
  // and that selection is still shown and recorded explicitly.
  const unitMode = !!units && units.length > 0 && !!projectId
  const unitViews = useMemo(() => (units ?? []).map(u => describeUnit(u)), [units])
  const [selectedUnitId, setSelectedUnitId] = useState<string>(units && units.length === 1 ? units[0].id : '')
  const [purpose, setPurpose] = useState<RequestPurpose | ''>('')
  const selectedUnit = unitViews.find(u => u.id === selectedUnitId) ?? null
  const estimatedPrice = unitMode ? (selectedUnit?.priceNgn ?? 0) : (estimatedPriceNgn ?? 0)
  const effDepositPct = unitMode ? (selectedUnit?.depositPct ?? null) : (unitDepositPct ?? null)
  const effInstallmentMonths = unitMode ? (selectedUnit?.installmentMonths ?? null) : (unitInstallmentMonths ?? null)
  const confirmOnly = unitMode && purpose === 'confirm_price_availability'
  const financingNeeded = !unitMode || (purpose !== '' && purposeNeedsFinancing(purpose))

  const [step, setStep]               = useState<Step>(unitMode ? 'unit' : 'type')
  const [leadReference, setLeadReference] = useState<string | null>(null)
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
  // The scenario that was calculated, kept so a failed save can be retried and so the request can carry it.
  const [scenario, setScenario]       = useState<{ inputs: Record<string, unknown>; outputs: Record<string, any> } | null>(null)
  // '' = saved, or no save attempted. Anything else is the real reason the scenario was NOT saved.
  const [saveError, setSaveError]     = useState('')
  const [retrying, setRetrying]       = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')
  // VISUAL IDENTITY PASS — enquiry consent/acknowledgement (brief §9).
  // Gates submission; see submit() for how it's persisted.
  const [consentAcknowledged, setConsentAcknowledged] = useState(false)
  // Developer-plan introductions only: the buyer agrees MANOP may record the
  // introduction and share their details with the developer/authorised agency.
  const [attributionAcknowledged, setAttributionAcknowledged] = useState(false)
  // PHASE 8 — Finance Suitability: matches against published lender
  // products (lib/finance-products.ts, via /api/finance-products). Starts
  // empty and stays empty until admin adds lender products — that's the
  // honest state, not a bug, since this never fabricates a match.
  const [productMatches, setProductMatches] = useState<ProductMatch[] | null>(null)

  const selectedType = FINANCING_TYPES.find(t => t.key === financingType)
  const runsAffordability = !!selectedType && selectedType.key !== 'developer_plan'

  // Real Payment Plan Intelligence for this specific unit — null (not an
  // error) when the developer hasn't set deposit_pct/installment_months
  // yet, in which case the step below falls back to the generic fields.
  const unitTerms = describeUnitPaymentTerms({ price_ngn: estimatedPrice, deposit_pct: effDepositPct, installment_months: effInstallmentMonths })
  const unitPlan = financingType === 'developer_plan' ? unitTerms.plan
    : null

  function fmtNGN(n: number) {
    if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
    return `₦${n.toLocaleString()}`
  }

  function enterAssessment() {
    if (selectedType) setInterestRatePct(String(selectedType.defaultRatePct ?? ''))
    setStep('assessment')
  }

  // The numbers the buyer entered, as the calculation sees them. The down payment is entered in ₦ millions and may
  // be a decimal (2.5 = ₦2.5M): this used parseInt, which silently turned 2.5 into 2.
  function liveInputs() {
    return {
      property_price_ngn: estimatedPrice,
      deposit_available_ngn: form.down_payment_ngn.trim() === '' ? 0 : parseFloat(form.down_payment_ngn) * 1_000_000,
      fees_ngn: 0, // not collected yet — excludes legal/agency fees; stated beside the figures
      interest_rate_pct: parseFloat(interestRatePct),
      loan_tenor_years: parseInt(form.tenure_months) / 12,
    }
  }
  // Plain-language problems with those numbers (empty list = calculable). Shown to the buyer instead of a blank panel.
  function liveErrors(): string[] {
    return validateAffordabilityInputs(liveInputs())
  }
  function computeLive(): AffordabilityOutputs | null {
    if (liveErrors().length > 0) return null
    return calculateAffordability(liveInputs())
  }

  // PHASE 8 — refetches matches whenever the live LTV changes meaningfully
  // (rounded to whole points, so retyping a digit doesn't refire on every
  // keystroke). Only runs for financing types this assessment step applies
  // to (runsAffordability already excludes developer_plan, which has no
  // LTV concept) and skips entirely with no rate/deposit entered yet.
  const liveForMatching = step === 'assessment' ? computeLive() : null
  const ltvRounded = liveForMatching ? Math.round(liveForMatching.ltv_pct) : null
  // Loan amount and deposit share are rounded so retyping a digit does not refire on every keystroke.
  const loanRounded = liveForMatching ? Math.round(liveForMatching.mortgage_requirement_ngn / 100_000) * 100_000 : null
  const depositPctRounded = liveForMatching && estimatedPrice > 0 ? Math.round(((liveForMatching.deposit_applied_ngn ?? 0) / estimatedPrice) * 100) : null
  useEffect(() => {
    if (ltvRounded == null) { setProductMatches(null); return }
    let cancelled = false
    const params = new URLSearchParams({
      country_code: 'NG',
      ltv_pct: String(ltvRounded),
      loan_tenor_years: String(parseInt(form.tenure_months) / 12),
      product_type: financingType === 'nhf' ? 'nhf' : 'mortgage',
      residency: form.is_diaspora ? 'diaspora' : 'resident',
    })
    if (loanRounded != null) params.set('loan_amount_ngn', String(loanRounded))
    if (depositPctRounded != null) params.set('deposit_pct', String(depositPctRounded))
    if (form.employment_status) params.set('employment', form.employment_status)
    if (form.buyer_city.trim()) params.set('city', form.buyer_city.trim())
    fetch(`/api/finance-products?${params}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('products unavailable')))
      .then(data => { if (!cancelled) setProductMatches(data.matches ?? []) })
      .catch(() => { if (!cancelled) setProductMatches(null) })
    return () => { cancelled = true }
  }, [ltvRounded, loanRounded, depositPctRounded, financingType, form.tenure_months, form.is_diaspora, form.employment_status, form.buyer_city])

  // Builds the scenario record from what is on screen. The development and unit are recorded inside `inputs`
  // (finance_analyses has no confirmed project/unit column, so nothing is assumed): they travel with the scenario.
  function buildScenario(result: AffordabilityOutputs) {
    return {
      inputs: {
        ...liveInputs(),
        financing_type: financingType,
        project_id: projectId ?? null,
        unit_type_id: unitMode ? selectedUnit?.id ?? null : null,
        unit_type_label: unitMode ? selectedUnit?.label ?? null : null,
        unit_price_ngn: unitMode ? selectedUnit?.priceNgn ?? null : null,
        assumptions: AFFORDABILITY_ASSUMPTIONS,
      } as Record<string, unknown>,
      outputs: result as unknown as Record<string, any>,
    }
  }

  // Saves the scenario through the server and RECORDS THE TRUTH about it. A failed save is never hidden: the buyer
  // is told it was not saved and why, can retry, and the request that follows says the scenario is unsaved (and carries
  // the numbers in its notes) instead of looking as if everything succeeded.
  async function persistScenario(s: { inputs: Record<string, unknown>; outputs: Record<string, any> }) {
    const r = await saveFinanceAnalysis({ analysis_type: 'buyer_affordability', property_id: propertyId ?? null, inputs: s.inputs, outputs: s.outputs })
    if (r.saved) {
      setFinanceAnalysisId(r.id); setFinanceReference(r.reference); setSaveError('')
    } else {
      setFinanceAnalysisId(null); setFinanceReference(null); setSaveError(r.error)
    }
    return r
  }

  async function saveAssessmentAndContinue() {
    const result = computeLive()
    if (!result) { setError(liveErrors()[0] || 'Check your numbers to see your affordability position.'); return }
    setError('')
    setSaving(true)
    const s = buildScenario(result)
    setScenario(s)
    try { await persistScenario(s) } finally { setSaving(false) }
    setAssessment(result)
    setStep('confirm')   // continuing is allowed; the confirm step shows whether the scenario was saved
  }

  async function retrySave() {
    if (!scenario) return
    setRetrying(true)
    try { await persistScenario(scenario) } finally { setRetrying(false) }
  }

  // One line for the request's notes. If the scenario did not save, the numbers are included so the person handling
  // the request still has them.
  function scenarioNote(): string {
    if (!scenario) return ''
    return financeReference
      ? `Saved scenario ${financeReference}.`
      : `Scenario NOT saved to the buyer's account${saveError ? ` (${saveError.slice(0, 160)})` : ''}. Declared figures: ${summariseAffordability(scenario.inputs as any, scenario.outputs)}.`
  }

  async function submit() {
    if (unitMode && (!selectedUnit || !purpose)) { setError('Choose the unit and what you would like first.'); return }
    if (!form.buyer_name || !form.buyer_email || !form.buyer_phone || !form.buyer_city) {
      setError('Please fill all required fields.'); return
    }
    if (!consentAcknowledged) {
      setError('Please confirm you understand the acknowledgement below before submitting.'); return
    }
    if ((unitMode || (financingType === 'developer_plan' && projectId)) && !attributionAcknowledged) {
      setError('Please confirm how MANOP will record and share this introduction.'); return
    }
    setSubmitting(true); setError('')

    // Unit-specific request on a Reviewed Development: one introduction in the canonical register,
    // carrying the chosen unit and request type. The server reads the unit's own price from the database
    // and snapshots it; nothing here sends a price. Lender-routed financing types additionally keep the
    // existing financing_requests record, now naming the unit.
    if (unitMode && selectedUnit && purpose) {
      try {
        const { data: { session: leadSession } } = await sb.auth.getSession()
        const typeLabel = FINANCING_TYPES.find(t => t.key === financingType)?.label
        // What the buyer was actually shown, worded exactly as it was shown: an indicative illustration, or "terms
        // recorded; schedule requires confirmation", never a schedule the developer has not confirmed.
        const terms = describeUnitPaymentTerms({ price_ngn: estimatedPrice, deposit_pct: effDepositPct, installment_months: effInstallmentMonths })
        const planText = financingType === 'developer_plan'
          ? `Payment terms shown to buyer: ${terms.headline}${terms.detail ? ` ${terms.detail}` : ''}`
          : null
        const res = await fetch('/api/developer-leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(leadSession?.access_token ? { Authorization: `Bearer ${leadSession.access_token}` } : {}),
          },
          body: JSON.stringify({
            attribution_acknowledged: attributionAcknowledged,
            project_id: projectId,
            unit_type_id: selectedUnit.id,
            request_purpose: purpose,
            financing_type: financingNeeded ? financingType : null,
            name: form.buyer_name.trim(),
            email: form.buyer_email.trim().toLowerCase() || null,
            phone: form.buyer_phone.trim() || null,
            country: form.is_diaspora ? form.country_of_residence : null,
            is_diaspora: form.is_diaspora,
            budget_usd: null,
            note: [
              financingNeeded && typeLabel ? `Financing preference: ${typeLabel}.` : null,
              planText,
              financingNeeded && financingType !== 'developer_plan' ? scenarioNote() : null,
              financingType === 'developer_plan' ? form.employment_status : null,
              financingType === 'developer_plan' ? form.monthly_income_range : null,
              'Enquiry consent acknowledged at submission.',
            ].filter(Boolean).join(' · '),
            source: 'manop_financing_unit_request',
            country_code: 'NG',
          }),
        })
        const data = await res.json()
        if (!res.ok) { setSubmitting(false); setError(data.error || 'Submission failed. Please try again.'); return }
        setLeadReference(data.manop_lead_id ?? null)

        if (financingNeeded && financingType !== 'developer_plan') {
          const { error: frErr } = await sb.from('financing_requests').insert({
            property_id:            propertyId ?? null,
            property_address:       `${propertyAddress ?? ''} — ${selectedUnit.label}`.trim(),
            estimated_price_ngn:    estimatedPrice,
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
            finance_analysis_id:    financeAnalysisId,
            notes: `Unit: ${selectedUnit.label} (${selectedUnit.id}). Introduction ${data.manop_lead_id ?? 'n/a'}. ${scenarioNote()} Enquiry consent acknowledged at submission.`,
          })
          if (frErr) { setSubmitting(false); setError('Your introduction was recorded, but the financing request could not be saved. Please press Submit again; it will not create a second introduction.'); return }
        }
        setSubmitting(false)
        setStep('success')
      } catch {
        setSubmitting(false)
        setError('Network error. Please try again.')
      }
      return
    }

    // Developer Installment Plan on a Reviewed Development: this isn't a
    // mortgage MANOP helps route to a lender, it's the developer's own
    // payment plan — the developer is who should see it, through the same
    // pipeline "Enquire about this development" already uses, not a
    // separate financing_requests row admin has to manually forward.
    if (financingType === 'developer_plan' && projectId) {
      try {
        // The buyer is identified server-side from this token (the body no
        // longer carries a user_id or developer_id — the API takes the
        // developer from the published project). Anonymous still works.
        const { data: { session: leadSession } } = await sb.auth.getSession()
        const res = await fetch('/api/developer-leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(leadSession?.access_token ? { Authorization: `Bearer ${leadSession.access_token}` } : {}),
          },
          body: JSON.stringify({
            attribution_acknowledged: attributionAcknowledged,
            project_id: projectId,
            unit_type_id: unitTypeId || null,
            name: form.buyer_name.trim(),
            email: form.buyer_email.trim().toLowerCase() || null,
            phone: form.buyer_phone.trim() || null,
            country: form.is_diaspora ? form.country_of_residence : null,
            is_diaspora: form.is_diaspora,
            budget_usd: null, // priced in NGN here; leave unset rather than guess an FX rate
            // When the unit has real deposit_pct/installment_months, the
            // developer/agency sees the exact terms the buyer was shown —
            // not just "interested in an installment plan" with no
            // numbers, which is what this note used to say regardless.
            note: [
              (() => {
                const t = describeUnitPaymentTerms({ price_ngn: estimatedPrice, deposit_pct: effDepositPct, installment_months: effInstallmentMonths })
                return `Financing preference: developer installment plan. Payment terms shown to buyer: ${t.headline}${t.detail ? ` ${t.detail}` : ''}`
              })(),
              form.employment_status, form.monthly_income_range,
              // VISUAL IDENTITY PASS §9 — no dedicated consent column exists
              // on developer_leads (none is tracked in the repo's migrations),
              // so this reuses the existing free-text `note` field rather than
              // inventing one. If a dedicated, queryable record of consent is
              // wanted later: ALTER TABLE developer_leads ADD COLUMN IF NOT
              // EXISTS enquiry_consent_acknowledged boolean DEFAULT false;
              'Enquiry consent acknowledged at submission.',
            ].filter(Boolean).join(' · '),
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
      estimated_price_ngn:    estimatedPrice,
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
      // VISUAL IDENTITY PASS §9 — financing_requests has a `notes` column
      // (confirmed: app/admin/page.tsx's updateFinancingStatus writes to
      // it), reused here rather than inventing a new boolean column. If a
      // dedicated, queryable consent flag is wanted later: ALTER TABLE
      // financing_requests ADD COLUMN IF NOT EXISTS enquiry_consent_acknowledged
      // boolean DEFAULT false;
      notes:                  `${scenarioNote()} Enquiry consent acknowledged at submission.`.trim(),
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

  const stepIndex = { unit: 0, type: 0, details: 1, income: 2, assessment: 3, confirm: 4, success: 5 }
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
            {step !== 'success' && !unitMode && (
              <div className="price-box">
                <div className="price-label">Property Value</div>
                <div className="price-value">{fmtNGN(estimatedPrice)}</div>
              </div>
            )}
            {step !== 'success' && step !== 'unit' && unitMode && selectedUnit && (
              <div className="price-box">
                <div className="price-label">Selected unit — {selectedUnit.label}</div>
                <div className="price-value">{priceLine(selectedUnit)}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 4, lineHeight: 1.5 }}>{selectedUnit.priceNote}</div>
              </div>
            )}

            {/* Step 0: choose the unit and what you want */}
            {step === 'unit' && unitMode && (
              <>
                <div style={{ fontSize: 13, color: c.textPrimary, fontWeight: 600, marginBottom: 10 }}>Which unit are you asking about?</div>
                <div role="radiogroup" aria-label="Unit type" style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
                  {unitViews.map(u => {
                    const sel = u.id === selectedUnitId
                    return (
                      <button key={u.id} type="button" role="radio" aria-checked={sel}
                        onClick={() => { setSelectedUnitId(u.id); if (purpose && purposeNeedsFinancing(purpose) && !u.canAssessFinancing) setPurpose('') }}
                        style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 10, padding: '12px 14px',
                          background: sel ? c.intelligencePurpleBg : c.surfaceCardHigh, border: `2px solid ${sel ? c.intelligencePurple : c.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: c.textPrimary }}>{u.label}{u.sizeSqm ? ` · ${u.sizeSqm}sqm` : ''}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: c.textPrimary, whiteSpace: 'nowrap' }}>{priceLine(u)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3, lineHeight: 1.5 }}>{u.priceNote} {u.availabilityNote}</div>
                      </button>
                    )
                  })}
                </div>

                <div style={{ fontSize: 13, color: c.textPrimary, fontWeight: 600, marginBottom: 10 }}>What would you like?</div>
                <div role="radiogroup" aria-label="Request type" style={{ display: 'grid', gap: 8, marginBottom: 6 }}>
                  {REQUEST_PURPOSES.map(pp => {
                    const blocked = !!selectedUnit && purposeNeedsFinancing(pp) && !selectedUnit.canAssessFinancing
                    const sel = purpose === pp
                    return (
                      <button key={pp} type="button" role="radio" aria-checked={sel} disabled={blocked} onClick={() => setPurpose(pp)}
                        style={{ textAlign: 'left', fontFamily: 'inherit', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600,
                          cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.45 : 1, color: c.textPrimary,
                          background: sel ? c.intelligencePurpleBg : c.surfaceCardHigh, border: `2px solid ${sel ? c.intelligencePurple : c.border}` }}>
                        {PURPOSE_LABEL[pp]}
                      </button>
                    )
                  })}
                </div>
                {selectedUnit && !selectedUnit.canAssessFinancing && (
                  <div style={{ fontSize: 11.5, color: c.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
                    This unit has no usable recorded price, so financing cannot be assessed for it. You can ask MANOP to confirm its price and availability.
                  </div>
                )}
                <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5, marginTop: 8 }}>
                  Prices are recorded asking prices supplied by the developer or agency. They are not an offer, and this is not a financing decision.
                </div>
                <div className="btn-row">
                  <button className="btn-p" disabled={!selectedUnit || !purpose} onClick={() => setStep(purpose === 'confirm_price_availability' ? 'details' : 'type')}>Continue →</button>
                  <button className="btn-g" onClick={onClose}>Cancel</button>
                </div>
              </>
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
                  {unitMode ? <button className="btn-g" onClick={() => setStep('unit')}>← Back</button> : <button className="btn-g" onClick={onClose}>Cancel</button>}
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
                  <button className="btn-p" onClick={() => setStep(confirmOnly ? 'confirm' : 'income')}>{confirmOnly ? 'Review →' : 'Continue →'}</button>
                  <button className="btn-g" onClick={() => setStep(confirmOnly ? 'unit' : 'type')}>← Back</button>
                </div>
              </>
            )}

            {/* Step 3: Financial Details */}
            {step === 'income' && financingType === 'developer_plan' && (
              <>
                <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 16 }}>
                  This development's own payment plan — not a bank loan, no interest rate to enter.
                </div>

                {unitPlan ? (
                  <div style={{ background: c.intelligencePurpleBg, border: `1px solid ${c.intelligencePurple}40`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.statusAmber, marginBottom: 8 }}>
                      Indicative illustration: the developer has not confirmed this as the payment schedule
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <div className="lbl" style={{ marginBottom: 2 }}>Deposit recorded ({effDepositPct}%)</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(unitPlan.deposit_ngn)}</div>
                      </div>
                      <div>
                        <div className="lbl" style={{ marginBottom: 2 }}>If the balance were spread equally</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(unitPlan.monthly_installment_ngn)} / month</div>
                      </div>
                      <div>
                        <div className="lbl" style={{ marginBottom: 2 }}>Period recorded</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{unitPlan.installment_months} months</div>
                      </div>
                      <div>
                        <div className="lbl" style={{ marginBottom: 2 }}>Balance after the deposit</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(unitPlan.balance_ngn)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.6 }}>
                      {unitTerms.caveats.join(' ')} This is not a MANOP or lender decision.
                    </div>
                  </div>
                ) : (
                  <div style={{ background: c.intelligencePurpleBg, border: `1px solid ${c.intelligencePurple}40`, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.textPrimary, marginBottom: 4 }}>{unitTerms.headline}</div>
                    {unitTerms.detail && <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.6, marginBottom: 6 }}>{unitTerms.detail}</div>}
                    <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.6 }}>
                      Submit your question below and MANOP will ask the developer to confirm the payment structure. {unitTerms.caveats.join(' ')}
                    </div>
                  </div>
                )}

                <div className="fgg">
                  <label className="lbl">Employment Status (optional)</label>
                  <select className="inp" value={form.employment_status} onChange={e => setForm(p => ({ ...p, employment_status: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="employed">Salaried employee</option>
                    <option value="self_employed">Self-employed</option>
                    <option value="business_owner">Business owner</option>
                    <option value="diaspora">Diaspora</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>

                <div className="btn-row">
                  <button className="btn-p" onClick={() => setStep('confirm')}>Review →</button>
                  <button className="btn-g" onClick={() => setStep('details')}>← Back</button>
                </div>
              </>
            )}

            {step === 'income' && financingType !== 'developer_plan' && (
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
                          <div className="lbl" style={{ marginBottom: 2 }}>Property price</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(estimatedPrice)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Deposit applied</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.deposit_applied_ngn ?? 0)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Outstanding balance to finance</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.mortgage_requirement_ngn)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Loan as a share of price (LTV)</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{live.ltv_pct.toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Indicative monthly repayment</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.indicative_monthly_repayment_ngn)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Total estimated repayment</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.total_repayment_ngn)}</div>
                        </div>
                        <div>
                          <div className="lbl" style={{ marginBottom: 2 }}>Cash needed up front (deposit + fees entered)</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: c.textPrimary }}>{fmtNGN(live.cash_requirement_ngn)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c.verificationTeal }}>{label}</div>
                      <ul style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.6, paddingLeft: 16 }}>
                        {AFFORDABILITY_ASSUMPTIONS.map(a => <li key={a}>{a}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                      {form.down_payment_ngn.trim() === '' && interestRatePct.trim() === ''
                        ? 'Enter a down payment and an interest rate to see your affordability position.'
                        : liveErrors().map(e => <div key={e} style={{ color: c.statusRed }}>{e}</div>)}
                    </div>
                  )}

                  {/* PHASE 8 — Finance Suitability. Compares the LTV above
                      against published lender products (empty until an
                      admin adds any — see lib/finance-products.ts). Never
                      a lending decision; a "fits" match means your own
                      numbers meet the published criteria MANOP has on
                      file, not an approval. */}
                  {live && productMatches && (
                    <div style={{ marginBottom: 16 }}>
                      <div className="lbl" style={{ marginBottom: 6 }}>Finance Suitability</div>
                      {productMatches.filter(m => m.verdict !== 'stale' && m.verdict !== 'confirmation_required').length === 0 ? (
                        <div style={{ fontSize: 11.5, color: c.textMuted, lineHeight: 1.6 }}>
                          No verified lender products on file yet to compare this against.
                        </div>
                      ) : (
                        productMatches.filter(m => m.verdict !== 'stale' && m.verdict !== 'confirmation_required').map(m => (
                          <div key={m.product.id} style={{
                            padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                            background: m.fits ? c.verificationTealBg : c.surfaceCardHigh,
                            border: `1px solid ${m.fits ? c.verificationTeal + '40' : c.border}`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: c.textPrimary }}>{m.product.lender_name} — {m.product.product_name}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: m.fits ? c.verificationTeal : c.textMuted, textAlign: 'right' as const }}>
                                {VERDICT_LABEL[m.verdict]}
                              </span>
                            </div>
                            {m.reasons.map((r, i) => <div key={i} style={{ fontSize: 10.5, color: c.textMuted, marginTop: 2, lineHeight: 1.5 }}>{r}</div>)}
                            <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>
                              {m.needs_provider_confirmation ? 'MANOP has not had this confirmed by the provider. ' : ''}
                              Published criteria as MANOP last checked them (
                              {new Date(m.product.last_verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              ); the lender decides.
                            </div>
                          </div>
                        ))
                      )}
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
                    Affordability scenario saved as {financeReference}. A saved scenario is separate from your request: submitting the request below does not change it.
                  </div>
                )}
                {!financeReference && scenario && (
                  <div role="alert" style={{ fontSize: 11.5, color: c.statusAmber, marginBottom: 10, lineHeight: 1.6, padding: '8px 10px', border: `1px solid ${c.statusAmber}55`, borderRadius: 8 }}>
                    <strong>Your scenario was NOT saved</strong>{saveError ? `: ${saveError}` : '.'} You can still send your request: your figures will be included in it, but it will not be linked to a saved scenario in your account.
                    <div style={{ marginTop: 6 }}>
                      <button type="button" className="btn-g" onClick={retrySave} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry saving'}</button>
                    </div>
                  </div>
                )}
                {assessment && (
                  <div style={{ marginBottom: 10 }}>
                    <EvidenceTag kind="calculated" dark={dark} /> <EvidenceTag kind="indicative" dark={dark} />
                  </div>
                )}
                {[
                  ...(unitMode && selectedUnit ? [
                    { label: 'Unit', value: selectedUnit.label },
                    { label: 'Recorded price', value: priceLine(selectedUnit) },
                    { label: 'Request', value: purpose ? PURPOSE_LABEL[purpose] : '—' },
                  ] : []),
                  { label: 'Name', value: form.buyer_name },
                  { label: 'Email', value: form.buyer_email },
                  { label: 'Phone', value: form.buyer_phone },
                  { label: 'City', value: form.buyer_city },
                  ...(financingNeeded ? [
                    { label: 'Financing type', value: FINANCING_TYPES.find(t => t.key === financingType)?.label ?? financingType },
                    { label: 'Loan needed', value: form.loan_amount_requested ? `₦${form.loan_amount_requested}M` : '—' },
                    { label: 'Down payment', value: form.down_payment_ngn ? `₦${form.down_payment_ngn}M` : '—' },
                    { label: 'Tenure', value: `${parseInt(form.tenure_months) / 12} years` },
                  ] : []),
                  ...(assessment ? [
                    { label: 'LTV', value: `${assessment.ltv_pct.toFixed(0)}%` },
                    { label: 'Monthly repayment', value: fmtNGN(assessment.indicative_monthly_repayment_ngn) },
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
                  {unitMode
                    ? (confirmOnly
                        ? 'After submitting, MANOP will follow up to confirm the current price and availability of this unit. Nothing here is an offer or a reservation.'
                        : 'After submitting, MANOP will follow up on this unit. Financing is subject to lender assessment; this request is not an approval and not an offer.')
                    : `After submitting, MANOP will review your request and connect you with the most suitable financing partner in ${form.buyer_city}. You will receive an email within 1-2 business days.`}
                </div>

                {/* VISUAL IDENTITY PASS §9 — enquiry consent/acknowledgement.
                    Required before submission; see submit()'s guard above. */}
                <div style={{ marginTop: 14 }}>
                  <ConsentCheckbox checked={consentAcknowledged} onChange={setConsentAcknowledged} dark={dark} />
                </div>

                {(unitMode || (financingType === 'developer_plan' && projectId)) && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 12, color: c.textMuted, lineHeight: 1.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={attributionAcknowledged} onChange={e => setAttributionAcknowledged(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>
                      I consent to MANOP recording this enquiry, reviewing it, and then sharing my details with the developer or
                    authorised partner in charge so they can contact me. This does not commit me to buy anything. <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>How MANOP handles your details</a>.
                    </span>
                  </label>
                )}

                {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}

                <div className="btn-row">
                  <button className="btn-p" onClick={submit} disabled={submitting || !consentAcknowledged}>
                    {submitting ? 'Submitting…' : 'Submit Request'}
                  </button>
                  <button className="btn-g" onClick={() => setStep(confirmOnly ? 'details' : runsAffordability ? 'assessment' : 'income')}>← Back</button>
                </div>
              </>
            )}

            {/* Step 5: Success */}
            {step === 'success' && (
              <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
                <div className="success-icon"><CheckCircle2 size={30} /></div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.textPrimary, marginBottom: 10 }}>Request submitted</div>
                <div style={{ fontSize: 13, color: c.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
                  {unitMode && selectedUnit ? (
                    <>
                      Your request about the <strong style={{ color: c.textPrimary }}>{selectedUnit.label}</strong> has been recorded
                      {leadReference ? <> as <strong style={{ color: c.textPrimary }}>{leadReference}</strong></> : null}. MANOP will follow up with you at <strong style={{ color: c.textPrimary }}>{form.buyer_email}</strong>.
                      This is a record of your request, not an offer or a financing decision.
                    </>
                  ) : (
                    <>
                      We'll review your request and connect you with a financing partner in <strong style={{ color: c.textPrimary }}>{form.buyer_city}</strong> within 1-2 business days.<br /><br />
                      Check your email at <strong style={{ color: c.textPrimary }}>{form.buyer_email}</strong> for next steps.
                    </>
                  )}
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