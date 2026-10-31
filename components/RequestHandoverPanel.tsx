'use client'
// Admin: detail view + Copy Request Details for one financing request or introduction.
// Copying text does NOT change the request's status or imply anyone was contacted; the admin records that separately.
import { useState } from 'react'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import {
  buildInternalSummary, buildDeveloperRequest, buildPartnerEnquiry, missingInformation, nextAction, type HandoverRequest,
} from '../lib/request-handover'

type Variant = 'internal' | 'developer' | 'partner'
const LABEL: Record<Variant, string> = { internal: 'Internal summary', developer: 'Developer information request', partner: 'Financing-partner enquiry' }

export async function copyText(text: string): Promise<{ ok: boolean; error: string }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return { ok: true, error: '' }
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok ? { ok: true, error: '' } : { ok: false, error: 'Your browser blocked copying. Select the text below and copy it manually.' }
  } catch {
    return { ok: false, error: 'Your browser blocked copying. Select the text below and copy it manually.' }
  }
}

export default function RequestHandoverPanel({ request }: { request: HandoverRequest }) {
  const [variant, setVariant] = useState<Variant>('internal')
  const [shareDev, setShareDev] = useState(false)
  const [sharePartner, setSharePartner] = useState(false)
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null)

  const canShareDev = request.consent.attribution_acknowledged === true
  const text = variant === 'internal' ? buildInternalSummary(request)
    : variant === 'developer' ? buildDeveloperRequest(request, { shareBuyerWithDeveloper: shareDev })
    : buildPartnerEnquiry(request, { shareContactWithPartner: sharePartner })
  const missing = missingInformation(request)

  async function doCopy() {
    const r = await copyText(text)
    setState(r.ok ? { ok: true, msg: `${LABEL[variant]} copied. Copying does not record that anyone was contacted.` } : { ok: false, msg: r.error })
    if (r.ok) setTimeout(() => setState(null), 4000)
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Next action: {nextAction(request)}</div>
      {missing.length > 0 && (
        <div role="note" style={{ display: 'flex', gap: 8, fontSize: 12, padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8 }}>
          <AlertTriangle size={14} aria-hidden />
          <div><strong>Missing:</strong> {missing.join(' ')}</div>
        </div>
      )}
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {(Object.keys(LABEL) as Variant[]).map(v => (
          <button key={v} role="tab" aria-selected={variant === v} className={`btn btn-sm ${variant === v ? 'btn-p' : ''}`} onClick={() => { setVariant(v); setState(null) }}>{LABEL[v]}</button>
        ))}
      </div>
      {variant === 'developer' && (
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={shareDev && canShareDev} disabled={!canShareDev} onChange={e => setShareDev(e.target.checked)} />{' '}
          Include buyer details {canShareDev ? '(buyer agreed to share)' : '(unavailable: no recorded agreement to share)'}
        </label>
      )}
      {variant === 'partner' && (
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={sharePartner} onChange={e => setSharePartner(e.target.checked)} />{' '}
          Include contact details (tick only once the applicant has agreed to their release)
        </label>
      )}
      <textarea readOnly value={text} aria-label={LABEL[variant]} onFocus={e => e.currentTarget.select()}
        style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12, padding: 8 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn-p btn-sm" onClick={doCopy}>{state?.ok ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} Copy Request Details</button>
        {state && <span role={state.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{state.msg}</span>}
      </div>
    </div>
  )
}