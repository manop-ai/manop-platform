'use client'
// components/MandateLetterUploader.tsx — upload a mandate letter THROUGH MANOP (no links). The file goes straight from the browser to MANOP's
// private storage using a one-file signed upload that the server created; the server then checks what was stored before accepting it.
// Shows upload status and MANOP's review status, and allows replacing a letter (the old one stays on record, no longer current).
import { useCallback, useEffect, useRef, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'
import { validateUpload } from '../lib/mandate-letter'

interface Props { dark?: boolean; projectId?: string | null; onReady?: (letterId: string | null) => void; compact?: boolean }

export default function MandateLetterUploader({ dark = true, projectId = null, onReady, compact = false }: Props) {
  const [letters, setLetters] = useState<any[]>([])
  const [configured, setConfigured] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [replaces, setReplaces] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const border = dark ? 'rgba(248,250,252,0.15)' : 'rgba(15,23,42,0.15)'

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/agency/mandate-letters'); const j = await res.json().catch(() => null)
      if (!res.ok) { setError(j?.error || 'Could not load your letters.'); return }
      setLetters(j.letters ?? []); setConfigured(j.uploadsConfigured !== false)
      const current = (j.letters ?? []).find((l: any) => ['uploaded', 'under_review', 'approved'].includes(l.status) && (!projectId || l.projectId === projectId || !l.projectId))
      onReady?.(current?.id ?? null)
    } catch { setError('Could not load your letters. Check your connection.') }
  }, [onReady, projectId])
  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setError(''); setBusy(true)
    let letterId: string | null = null
    try {
      const v = validateUpload({ filename: file.name, bytes: file.size }); if (!v.ok) { setError(v.error!); return }
      setProgress('Preparing…')
      const s = await authedFetch('/api/agency/mandate-letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign', filename: file.name, bytes: file.size, project_id: projectId, replaces_id: replaces }) })
      const sj = await s.json().catch(() => null)
      if (!s.ok) { setError(sj?.error || 'Could not start the upload.'); return }
      letterId = sj.letter_id
      setProgress('Uploading…')
      const fd = new FormData()
      Object.entries(sj.upload.fields).forEach(([k, val]) => fd.append(k, String(val)))
      fd.append('file', file)
      const up = await fetch(sj.upload.uploadUrl, { method: 'POST', body: fd })
      if (!up.ok) {
        await authedFetch('/api/agency/mandate-letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fail', letter_id: letterId }) })
        setError('The upload did not finish. Please try again.'); return
      }
      setProgress('Checking your file…')
      const c = await authedFetch('/api/agency/mandate-letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', letter_id: letterId }) })
      const cj = await c.json().catch(() => null)
      if (!c.ok) { setError(cj?.error || 'We could not accept that file. Please try again.'); return }
      setReplaces(null); await load()
    } catch {
      if (letterId) { try { await authedFetch('/api/agency/mandate-letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fail', letter_id: letterId }) }) } catch { /* retry is still possible */ } }
      setError('Something went wrong while uploading. Please check your connection and try again.')
    } finally { setBusy(false); setProgress(''); if (fileRef.current) fileRef.current.value = '' }
  }

  async function view(id: string) {
    const res = await authedFetch(`/api/mandate-letters/${id}/file`); const j = await res.json().catch(() => null)
    if (res.ok && j?.url) window.open(j.url, '_blank', 'noopener'); else setError(j?.error || 'Could not open the file.')
  }

  const current = letters.filter(l => l.status !== 'superseded')
  return (
    <div style={{ border: `1px dashed ${border}`, borderRadius: 8, padding: compact ? '0.6rem' : '0.9rem' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Mandate letter *</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8, opacity: 0.85 }}>Upload the signed letter that shows you may market this development (PDF, JPG or PNG, up to 10 MB). It is stored privately. Only you and MANOP can open it unless MANOP decides otherwise. A phone photo is fine if it is clear and complete.</div>
      {!configured && <div role="alert" style={{ fontSize: 12, marginBottom: 6 }}>Uploads are not available yet. Please contact MANOP.</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: '#EF4444', marginBottom: 6 }}>{error}</div>}
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy || !configured} aria-label="Choose mandate letter file"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
      {busy && <div role="status" style={{ fontSize: 12, marginTop: 6 }}>{progress}</div>}
      {current.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
          {current.map(l => (
            <li key={l.id} style={{ fontSize: 12, border: `1px solid ${border}`, borderRadius: 6, padding: '0.5rem' }}>
              <div><strong>{l.filename}</strong> · version {l.version} · {l.statusLabel}</div>
              <div style={{ opacity: 0.85 }}>{l.nextStep}</div>
              {l.reviewNote && <div style={{ marginTop: 2 }}><strong>MANOP says:</strong> {l.reviewNote}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => view(l.id)} style={{ fontSize: 12 }}>View</button>
                {['uploaded', 'under_review', 'approved', 'changes_requested', 'rejected'].includes(l.status) && (
                  <button type="button" disabled={busy} style={{ fontSize: 12 }} onClick={() => { setReplaces(l.id); fileRef.current?.click() }}>Replace with a new file</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
