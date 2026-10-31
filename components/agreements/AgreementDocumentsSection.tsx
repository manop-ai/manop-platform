'use client'
// Partner: download the agreement MANOP signed and sent, sign it by hand, upload the signed copy, and later download the completed record.
// Uploading a signed copy submits it for MANOP's review. It does NOT make the agreement executed; only MANOP recording it as completed does.
import { useCallback, useEffect, useRef, useState } from 'react'
import { authedFetch } from '../../lib/authed-fetch'
import { validateAgreementUpload, DOC_LABEL } from '../../lib/agreement-docs'

export default function AgreementDocumentsSection({ requestId, status, dark, onChanged }: { requestId: string; status: string; dark: boolean; onChanged?: () => void }) {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState('')
  const [note, setNote] = useState(''); const fileRef = useRef<HTMLInputElement>(null)
  const border = dark ? 'rgba(248,250,252,0.14)' : 'rgba(15,23,42,0.18)'
  const load = useCallback(async () => {
    const r = await authedFetch(`/api/agreements/${requestId}/documents`); const j = await r.json().catch(() => null)
    if (!r.ok) { setErr(j?.error || 'Could not load the documents.'); return }
    setData(j); setErr('')
  }, [requestId])
  useEffect(() => { load() }, [load, status])

  async function open(id: string) {
    const r = await authedFetch(`/api/agreement-documents/${id}/file`); const j = await r.json().catch(() => null)
    if (r.ok && j?.url) { window.open(j.url, '_blank', 'noopener'); load(); onChanged?.() } else setErr(j?.error || 'Could not open the file.')
  }
  async function upload(file: File, versionId: string) {
    setErr(''); setBusy(true); let docId: string | null = null
    const post = (b: any) => authedFetch(`/api/agreements/${requestId}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    try {
      const v = validateAgreementUpload({ filename: file.name, bytes: file.size }); if (!v.ok) { setErr(v.error!); return }
      setProgress('Preparing…')
      const s = await post({ action: 'sign', version_id: versionId, filename: file.name, bytes: file.size, note }); const sj = await s.json().catch(() => null)
      if (!s.ok) { setErr(sj?.error || 'Could not start the upload.'); return }
      docId = sj.document_id; setProgress('Uploading…')
      const fd = new FormData(); Object.entries(sj.upload.fields).forEach(([k, val]) => fd.append(k, String(val))); fd.append('file', file)
      const up = await fetch(sj.upload.uploadUrl, { method: 'POST', body: fd })
      if (!up.ok) { await post({ action: 'fail', document_id: docId }); setErr('The upload did not finish. Please try again.'); return }
      setProgress('Checking your file…')
      const c = await post({ action: 'complete', document_id: docId }); const cj = await c.json().catch(() => null)
      if (!c.ok) { setErr(cj?.error || 'We could not accept that file. Please try again.'); return }
      setNote(''); await load(); onChanged?.()
    } catch { if (docId) { try { await post({ action: 'fail', document_id: docId }) } catch { /* retry possible */ } } setErr('Something went wrong while uploading. Please check your connection and try again.') }
    finally { setBusy(false); setProgress(''); if (fileRef.current) fileRef.current.value = '' }
  }

  if (!data) return err ? <div role="alert" style={{ fontSize: 13, color: '#EF4444' }}>{err}</div> : null
  if (data.unavailable) return null
  const docs: any[] = data.documents
  if (!docs.length && !['agreement_sent', 'awaiting_signature', 'signed_copy_received', 'countersignature_pending', 'executed'].includes(status)) return null
  const issued = docs.filter(d => d.kind === 'issued'), signed = docs.filter(d => d.kind === 'signed_copy'), final = docs.find(d => d.kind === 'final_executed')
  const current = issued.find(d => d.status === 'issued')
  const canUpload = !!current && ['agreement_sent', 'awaiting_signature'].includes(status)
  const row: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 4, padding: '0.6rem 0.75rem', marginBottom: 8, fontSize: 13.5, lineHeight: 1.6 }
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 8 }}>Agreement documents</div>
      {data.nextStep && <div role="status" style={{ ...row, borderColor: '#14B8A6' }}>{data.nextStep}</div>}
      {err && <div role="alert" style={{ ...row, borderColor: '#EF4444', color: '#EF4444' }}>{err}</div>}
      {final && <div style={{ ...row, borderColor: '#22C55E' }}><strong>Completed agreement</strong> (version {final.versionNumber}), recorded by MANOP {final.countersignedAt ? new Date(final.countersignedAt).toLocaleDateString() : ''}. <button type="button" onClick={() => open(final.id)} style={{ marginLeft: 8, fontSize: 13 }}>Download</button></div>}
      {issued.map(d => (
        <div key={d.id} style={row}>
          <strong>{d.title || `Version ${d.versionNumber}`}</strong> · version {d.versionNumber} · {DOC_LABEL[d.status as keyof typeof DOC_LABEL]}{d.issuedAt ? ` · issued ${new Date(d.issuedAt).toLocaleDateString()}` : ''}
          <div style={{ opacity: 0.85 }}>{d.scopeSummary}</div>
          {d.termsSummary && <details><summary>Summary of terms</summary><div style={{ whiteSpace: 'pre-wrap' }}>{d.termsSummary}</div></details>}
          <div style={{ opacity: 0.7, fontSize: 12.5 }}>{d.legalReviewStatus === 'approved' ? '' : 'This template has not yet been legally reviewed. The signed document MANOP records is the record.'}</div>
          <button type="button" onClick={() => open(d.id)} style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>Download this version</button>
          {d.id === current?.id && canUpload && <span style={{ marginLeft: 8, fontWeight: 700 }}>← the version to sign</span>}
        </div>
      ))}
      {signed.map(d => (
        <div key={d.id} style={row}>
          <strong>Your signed copy</strong> of version {d.versionNumber} · {DOC_LABEL[d.status as keyof typeof DOC_LABEL]}{d.uploadedAt ? ` · uploaded ${new Date(d.uploadedAt).toLocaleString()}` : ''}
          {d.requesterNote && <div>Your note: {d.requesterNote}</div>}
          {d.reviewNote && <div><strong>MANOP says:</strong> {d.reviewNote}</div>}
          <button type="button" onClick={() => open(d.id)} style={{ fontSize: 13 }}>View</button>
        </div>
      ))}
      {canUpload && (
        <div style={{ ...row, borderStyle: 'dashed' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Upload your signed copy of version {current.versionNumber}</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 6 }}>The version above is already signed by MANOP. Print it, sign it by hand, then scan or photograph the complete signed document (PDF, JPG or PNG, up to 10 MB). Uploading it sends it to MANOP for review; the agreement is not complete until MANOP records it.</div>
          <textarea rows={2} placeholder="Optional note to MANOP" value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', color: 'inherit', border: `1px solid ${border}`, borderRadius: 4, padding: '0.4rem', fontFamily: 'inherit', marginBottom: 6 }} />
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy || !data.uploadsConfigured} aria-label="Choose signed agreement file" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, current.id) }} />
          {!data.uploadsConfigured && <div role="alert" style={{ fontSize: 12.5 }}>Uploads are not available yet. Please contact MANOP.</div>}
          {busy && <div role="status" style={{ fontSize: 12.5, marginTop: 4 }}>{progress}</div>}
        </div>
      )}
    </div>
  )
}
