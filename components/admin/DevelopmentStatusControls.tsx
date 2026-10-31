'use client'
// MANOP admin: suspend, reinstate or delete the selected development. Suspend is reversible and keeps every record; delete is permanent and
// only offered when nothing depends on the development. The server decides (see /api/admin/developments/[id]).
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../../lib/authed-fetch'

export default function DevelopmentStatusControls({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(''); const [confirmName, setConfirmName] = useState(''); const [showDelete, setShowDelete] = useState(false)
  const line = 'rgba(128,128,128,0.35)'
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'transparent', color: 'inherit', border: `1px solid ${line}`, borderRadius: 4, padding: '0.55rem', fontSize: 14, fontFamily: 'inherit' }
  const btn: React.CSSProperties = { border: `1px solid ${line}`, background: 'transparent', color: 'inherit', borderRadius: 4, padding: '0.55rem 0.9rem', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, minHeight: 40 }

  const load = useCallback(async () => {
    const r = await authedFetch(`/api/admin/developments/${projectId}`); const j = await r.json().catch(() => null)
    if (!r.ok) { setErr(j?.error || 'Could not load the status controls.'); setD(null); return }
    setD(j); setErr('')
  }, [projectId])
  useEffect(() => { setOk(''); setReason(''); setConfirmName(''); setShowDelete(false); load() }, [load])

  async function act(body: any) {
    setBusy(true); setErr(''); setOk('')
    const r = await authedFetch(`/api/admin/developments/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(j.error || 'That could not be done.'); return }
    setOk(j.message || 'Done.'); setReason(''); setConfirmName(''); setShowDelete(false)
    if (j.deleted) { setD(null); onChanged?.(); return }
    await load(); onChanged?.()
  }

  if (!d) return <div style={{ fontSize: 13.5 }}>{err || 'Loading…'}</div>
  const dev = d.development, rec = d.records
  const suspended = !!dev.suspended_at
  const attached = [rec.enquiries ? `${rec.enquiries} enquiries` : '', rec.agreementRequests ? `${rec.agreementRequests} agreement requests` : '', rec.mandateLetters ? `${rec.mandateLetters} mandate letters` : ''].filter(Boolean)

  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
      <div style={{ marginBottom: 8 }}>
        Status: <strong>{suspended ? 'Suspended' : dev.publish_status}</strong>
        {suspended && <> · {dev.suspended_reason} · since {new Date(dev.suspended_at).toLocaleDateString()}</>}
        {dev.partner_submitted && <> · partner-submitted (a completed agreement is required before it can be published)</>}
      </div>
      {err && <div style={{ color: '#DC2626', marginBottom: 8 }}>{err}</div>}
      {ok && <div style={{ color: '#15803D', marginBottom: 8 }}>{ok}</div>}

      {!suspended ? (
        <div style={{ marginBottom: 12 }}>
          <input style={{ ...inp, marginBottom: 8 }} placeholder="Reason for suspending (kept on the record)" value={reason} onChange={e => setReason(e.target.value)} />
          <button style={btn} disabled={busy || reason.trim().length < 5} onClick={() => act({ action: 'suspend', reason })}>Suspend (take off the public site)</button>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <button style={btn} disabled={busy} onClick={() => act({ action: 'reinstate' })}>Reinstate (as a draft)</button>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 10 }}>
        {attached.length ? (
          <div>Cannot be deleted: it has {attached.join(', ')}. These records are kept. Suspend it instead.</div>
        ) : !showDelete ? (
          <button style={{ ...btn, color: '#DC2626' }} onClick={() => setShowDelete(true)}>Delete permanently…</button>
        ) : (
          <div>
            <div style={{ marginBottom: 6 }}>Nothing depends on this development. Type its name (<strong>{dev.name}</strong>) to delete it for good.</div>
            <input style={{ ...inp, marginBottom: 8 }} value={confirmName} onChange={e => setConfirmName(e.target.value)} />
            <button style={{ ...btn, color: '#DC2626' }} disabled={busy || confirmName.trim() !== dev.name.trim()} onClick={() => act({ action: 'delete', confirm_name: confirmName })}>Delete permanently</button>
          </div>
        )}
      </div>
    </div>
  )
}
