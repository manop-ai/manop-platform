'use client'
// Admin: review mandate letters. Opening a file, accepting it, and making it public are THREE separate actions, each recorded.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'
import { STATUS_LABEL, type ReviewStatus } from '../lib/mandate-letter'

export default function AdminMandateLettersPanel() {
  const [rows, setRows] = useState<any[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const box: React.CSSProperties = { border: '1px solid rgba(128,128,128,0.35)', borderRadius: 6, padding: '0.8rem', marginBottom: 10, fontSize: 13 }

  const load = useCallback(async () => {
    const res = await authedFetch('/api/admin/mandate-letters'); const j = await res.json().catch(() => null)
    if (!res.ok) { setErr(j?.error || `Could not load (HTTP ${res.status}).`); return }
    setErr(''); setRows(j.letters ?? []); setUnavailable(!!j.unavailable); setConfigured(j.uploadsConfigured !== false)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(id: string, body: Record<string, unknown>, done: string) {
    setBusy(true); setErr(''); setMsg('')
    const res = await authedFetch('/api/admin/mandate-letters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, note: note[id] || null, ...body }) })
    const j = await res.json().catch(() => null)
    if (!res.ok) setErr(j?.error || `Failed (HTTP ${res.status}).`); else { setMsg(done); setNote({ ...note, [id]: '' }); await load() }
    setBusy(false)
  }
  async function open(id: string) {
    const res = await authedFetch(`/api/mandate-letters/${id}/file`); const j = await res.json().catch(() => null)
    if (res.ok && j?.url) window.open(j.url, '_blank', 'noopener'); else setErr(j?.error || 'Could not open the file.')
  }

  return (
    <section aria-label="Mandate letters">
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Agency mandate letters</h2>
      <p style={{ fontSize: 13, maxWidth: 720 }}>Letters are stored privately. Accepting a letter says it is adequate proof of authority; it does not approve the agency, the development, or public access. Public access is a separate decision, off by default, and can be withdrawn at any time.</p>
      {unavailable && <div style={box}>Not enabled yet: apply <code>sql/phase23_agency_mandate_letters.sql</code> in development first.</div>}
      {!configured && <div role="alert" style={box}>Storage credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not set on the server, so files cannot be uploaded or opened.</div>}
      {err && <div role="alert" style={{ ...box, borderColor: '#EF4444' }}>{err}</div>}
      {msg && <div role="status" style={{ ...box, borderColor: '#22C55E' }}>{msg}</div>}
      {rows.length === 0 && !unavailable && <div style={box}>No mandate letters yet.</div>}
      {rows.map(l => {
        const st = l.status as ReviewStatus
        return (
          <div key={l.id} style={box}>
            <div><strong>{l.data_partners?.name}</strong> · {l.original_filename} · v{l.version} · {l.format?.toUpperCase()} {l.bytes ? `${Math.round(l.bytes / 1024)} KB` : ''}</div>
            <div>Review: <strong>{STATUS_LABEL[st]}</strong> · Visibility: <strong>{l.visibility === 'public' ? 'Public (approved by MANOP)' : 'Internal only'}</strong>{l.developer_projects?.name ? ` · Development: ${l.developer_projects.name} (${l.developer_projects.publish_status})` : ' · Not yet attached to a development'}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Agency verification: {l.data_partners?.verification_status ?? 'unknown'} (separate from this letter) · Uploaded {l.uploaded_at ? new Date(l.uploaded_at).toLocaleString() : 'not finished'}{l.reviewed_at ? ` · Reviewed ${new Date(l.reviewed_at).toLocaleString()}` : ''}{l.visibility_changed_at ? ` · Visibility changed ${new Date(l.visibility_changed_at).toLocaleString()}` : ''}</div>
            {l.review_note && <div style={{ fontSize: 12 }}>Note to agency: {l.review_note}</div>}
            {!['removed', 'pending_upload', 'upload_failed'].includes(st) && (
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                <input placeholder="Note (needed to reject, request changes, change visibility or remove)" value={note[l.id] ?? ''} onChange={e => setNote({ ...note, [l.id]: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', padding: '0.4rem', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.4)', borderRadius: 4 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => open(l.id)}>Open file</button>
                  {st === 'uploaded' && <button disabled={busy} onClick={() => act(l.id, { action: 'start_review' }, 'Review started.')}>Start review</button>}
                  {['uploaded', 'under_review'].includes(st) && <button disabled={busy} onClick={() => act(l.id, { action: 'approve' }, 'Letter accepted (still internal).')}>Accept letter</button>}
                  {['uploaded', 'under_review', 'approved'].includes(st) && <>
                    <button disabled={busy} onClick={() => act(l.id, { action: 'request_changes' }, 'Changes requested.')}>Request changes</button>
                    <button disabled={busy} onClick={() => act(l.id, { action: 'reject' }, 'Letter rejected.')}>Reject</button></>}
                  {st === 'approved' && l.visibility === 'internal' && <button disabled={busy} onClick={() => act(l.id, { action: 'set_visibility', visibility: 'public' }, 'Letter is now public.')}>Make public</button>}
                  {l.visibility === 'public' && <button disabled={busy} onClick={() => act(l.id, { action: 'set_visibility', visibility: 'internal' }, 'Public access withdrawn.')}>Withdraw public access</button>}
                  <button disabled={busy} onClick={() => act(l.id, { action: 'remove' }, 'File removed.')}>Remove file</button>
                </div>
              </div>
            )}
            <details style={{ marginTop: 6 }}><summary>Audit trail ({l.events.length})</summary>
              {l.events.map((e: any) => <div key={e.id} style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString()} · {e.actor_role} · {e.event_type.replace(/_/g, ' ')}{e.detail?.note ? ` · ${e.detail.note}` : ''}</div>)}
            </details>
          </div>
        )
      })}
    </section>
  )
}
