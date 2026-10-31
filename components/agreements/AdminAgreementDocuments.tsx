'use client'
// Admin: prepare and send versioned agreements, review the returned signed copy, and record it as completed.
// MANOP signs the agreement FIRST, outside this screen, and uploads that signed PDF as the version to send. The partner signs by hand and uploads
// the copy. Recording it completed stores the accepted partner copy as the completed record; there is no second MANOP signature. A request becomes
// Executed ONLY here. Completing does not verify the opportunity, publish it or make anything payable.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../../lib/authed-fetch'
import { validateAgreementUpload, DOC_LABEL } from '../../lib/agreement-docs'

export default function AdminAgreementDocuments({ requestId, status, dark, onChanged }: { requestId: string; status: string; dark: boolean; onChanged: () => void }) {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  const [v, setV] = useState({ title: '', scope_summary: '', terms_summary: '' }); const [reviewNote, setReviewNote] = useState(''); const [effDate, setEffDate] = useState(() => new Date().toISOString().slice(0, 10))
  const border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.14)'
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: 14, marginBottom: 6 }
  const box: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 4, padding: '0.75rem', marginBottom: 10 }
  const base = `/api/admin/agreements/${requestId}/documents`
  const load = useCallback(async () => { const r = await authedFetch(base); const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg({ ok: false, text: j.error || 'Could not load.' }); return }; setD(j) }, [base])
  useEffect(() => { load() }, [load, status])
  const post = (b: any) => authedFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })

  async function simple(b: any, ok: string) { setBusy(true); setMsg(null); const r = await post(b); const j = await r.json().catch(() => ({})); setBusy(false); if (!r.ok) { setMsg({ ok: false, text: j.error || 'Could not save.' }); return } setMsg({ ok: true, text: ok }); await load(); onChanged() }
  async function uploadFlow(file: File, signBody: any, completeAction: string, ok: string) {
    setBusy(true); setMsg(null); let id: string | null = null
    try {
      const chk = validateAgreementUpload({ filename: file.name, bytes: file.size }); if (!chk.ok) { setMsg({ ok: false, text: chk.error! }); return }
      const s = await post({ ...signBody, filename: file.name, bytes: file.size }); const sj = await s.json().catch(() => ({})); if (!s.ok) { setMsg({ ok: false, text: sj.error || 'Could not start the upload.' }); return }
      id = sj.document_id; const fd = new FormData(); Object.entries(sj.upload.fields).forEach(([k, val]) => fd.append(k, String(val))); fd.append('file', file)
      const up = await fetch(sj.upload.uploadUrl, { method: 'POST', body: fd }); if (!up.ok) { await post({ action: 'fail', document_id: id }); setMsg({ ok: false, text: 'The upload did not finish. Try again.' }); return }
      const c = await post({ action: completeAction, document_id: id }); const cj = await c.json().catch(() => ({})); if (!c.ok) { setMsg({ ok: false, text: cj.error || 'The file was not accepted.' }); return }
      setMsg({ ok: true, text: ok }); await load(); onChanged()
    } catch { if (id) { try { await post({ action: 'fail', document_id: id }) } catch { /* ignore */ } } setMsg({ ok: false, text: 'Upload failed. Check the connection and try again.' }) } finally { setBusy(false) }
  }
  async function open(id: string) { const r = await authedFetch(`/api/agreement-documents/${id}/file`); const j = await r.json().catch(() => ({})); if (r.ok && j.url) window.open(j.url, '_blank', 'noopener'); else setMsg({ ok: false, text: j.error || 'Could not open.' }) }

  if (!d) return msg ? <div style={{ fontSize: 13 }}>{msg.text}</div> : null
  const docs: any[] = d.documents
  const issued = docs.filter(x => x.kind === 'issued'), signed = docs.filter(x => x.kind === 'signed_copy'), final = docs.find(x => x.kind === 'final_executed')
  const canPrepare = ['ready_for_agreement_preparation', 'agreement_prepared', 'agreement_sent', 'awaiting_signature', 'signed_copy_received', 'countersignature_pending'].includes(status)
  const pendingReview = signed.find(x => x.status === 'received'), accepted = signed.find(x => x.status === 'accepted')
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 8 }}>Agreement documents</div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ ...box, borderColor: msg.ok ? '#22C55E' : '#EF4444' }}>{msg.text}</div>}
      <div style={{ fontSize: 12.5, opacity: 0.8, marginBottom: 8 }}>Agreement templates are not legally approved yet; every version is marked unreviewed until your lawyer clears it.</div>

      {issued.map(x => (
        <div key={x.id} style={box}>
          <strong>Version {x.versionNumber}: {x.title}</strong> · {DOC_LABEL[x.status as keyof typeof DOC_LABEL]} · {x.coveredProjectIds?.length ? `${x.coveredProjectIds.length} development(s) covered (IDs fixed at issue)` : 'no development named'} · legal review: {x.legalReviewStatus}
          <div style={{ opacity: 0.85 }}>{x.scopeSummary}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => open(x.id)}>Open file</button>
            {x.status === 'draft' && <><button type="button" disabled={busy} onClick={() => simple({ action: 'issue', document_id: x.id }, 'Version sent. The requester can now download it.')}>Send to requester</button><button type="button" disabled={busy} onClick={() => simple({ action: 'withdraw', document_id: x.id }, 'Prepared version withdrawn.')}>Withdraw</button></>}
          </div>
        </div>
      ))}

      {canPrepare && !final && (
        <div style={{ ...box, borderStyle: 'dashed' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Prepare {issued.length ? 'a revised version' : 'the agreement'}</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 6 }}>Upload the agreement <strong>after MANOP has signed it</strong>. Fee terms come from {d.effectiveTerms ? `the approved terms in force (${d.effectiveTerms.label}; legal review: ${d.effectiveTerms.legalReview})` : 'NO approved terms version (approve one under Commercial terms first, or completion will be refused)'}.</div>
          <input style={inp} placeholder="Title (e.g. MANOP agency agreement)" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} />
          <textarea style={inp} rows={2} placeholder="What it covers, in plain words" value={v.scope_summary} onChange={e => setV({ ...v, scope_summary: e.target.value })} />
          <textarea style={inp} rows={3} placeholder="Commercial terms exactly as the document states them (nothing is applied automatically from this text)" value={v.terms_summary} onChange={e => setV({ ...v, terms_summary: e.target.value })} />
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy || !d.uploadsConfigured} aria-label="Choose agreement file" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFlow(f, { action: 'sign_version', ...v }, 'complete', 'Version prepared. Review it, then send it.') ; e.target.value = '' }} />
          {!d.uploadsConfigured && <div role="alert" style={{ fontSize: 12.5 }}>Storage credentials are missing.</div>}
          <div style={{ fontSize: 12, opacity: 0.75 }}>Sending a new version replaces the current one for signing. Earlier versions are kept.</div>
        </div>
      )}

      {signed.map(x => (
        <div key={x.id} style={box}>
          <strong>Signed copy of version {x.versionNumber}</strong> · {DOC_LABEL[x.status as keyof typeof DOC_LABEL]} {x.uploadedAt ? `· ${new Date(x.uploadedAt).toLocaleString()}` : ''}
          {x.requesterNote && <div>Requester note: {x.requesterNote}</div>}{x.reviewNote && <div>Review note: {x.reviewNote}</div>}
          <div><button type="button" onClick={() => open(x.id)}>Open file</button></div>
        </div>
      ))}
      {pendingReview && (
        <div style={box}>
          <div style={{ fontWeight: 700 }}>Review the signed copy</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 4 }}>Check it is the issued version, complete, legible and signed. Accepting does not complete the agreement.</div>
          <textarea style={inp} rows={2} placeholder="Note (required to hold or reject; shown to the requester)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={() => simple({ action: 'review_signed', document_id: pendingReview.id, decision: 'accept', note: reviewNote }, 'Accepted for countersignature.')}>Accept for countersignature</button>
            <button type="button" disabled={busy} onClick={() => simple({ action: 'review_signed', document_id: pendingReview.id, decision: 'hold', note: reviewNote }, 'Held; the requester was told what to correct.')}>Hold for correction</button>
            <button type="button" disabled={busy} onClick={() => simple({ action: 'review_signed', document_id: pendingReview.id, decision: 'reject', note: reviewNote }, 'Rejected; the requester was told why.')}>Reject</button>
          </div>
        </div>
      )}

      {accepted && !final && status === 'countersignature_pending' && (
        <div style={{ ...box, borderColor: '#5B2EFF' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Record the agreement as completed</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 6 }}>This stores the accepted partner-signed copy as the completed record and copies the fee terms of the approved terms version this agreement was prepared with. It does not publish or verify the opportunity, and it does not create any payment.</div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 8 }}>Effective date (today or earlier)
            <input type="date" value={effDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setEffDate(e.target.value)} style={{ display: 'block', marginTop: 4 }} />
          </label>
          <button type="button" disabled={busy || !effDate} onClick={() => simple({ action: 'record_completed', effective_date: effDate }, 'Recorded as completed. The request is now Executed.')}>Record as completed</button>
        </div>
      )}
      {final && <div style={{ ...box, borderColor: '#22C55E' }}><strong>Completed.</strong> Recorded {final.countersignedAt ? new Date(final.countersignedAt).toLocaleDateString() : ''} from the partner-signed copy of version {final.versionNumber}. <button type="button" onClick={() => open(final.id)}>Open completed copy</button></div>}

      <details><summary style={{ fontSize: 12.5 }}>Document audit trail ({d.events.length})</summary>
        <ul style={{ fontSize: 12, paddingLeft: 16 }}>{d.events.map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.actor_role} · {e.event_type.replace(/_/g, ' ')}</li>)}</ul></details>
    </div>
  )
}