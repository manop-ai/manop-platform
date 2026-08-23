'use client'
// app/association/accept-invite/page.tsx
// Uses @supabase/supabase-js directly — same pattern as rest of codebase

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSearchParams, useRouter } from 'next/navigation'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

export default function AcceptInvitePage() {
  const router = useRouter()

  const [status, setStatus]       = useState<'loading' | 'set_password' | 'success' | 'error'>('loading')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [inviteInfo, setInviteInfo] = useState<{
    email: string
    chapter_name: string | null
    association_name: string | null
  } | null>(null)

  useEffect(() => {
    // Supabase puts recovery tokens in the URL hash after clicking the link
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken  = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token') ?? ''
    const type         = hashParams.get('type')

    if (type === 'recovery' && accessToken) {
      sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data }) => {
          if (data.user) {
            loadInviteInfo(data.user.email ?? '')
            setStatus('set_password')
          } else {
            setStatus('error')
            setError('Session could not be established. Please ask for a new invitation.')
          }
        })
    } else {
      setStatus('error')
      setError('Invalid or expired invitation link. Contact your national association admin to resend.')
    }
  }, [])

  async function loadInviteInfo(email: string) {
    const { data } = await sb
      .from('association_admin_invitations')
      .select('email, association_chapters(name), associations(name)')
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setInviteInfo({
        email: data.email,
        chapter_name:     (data as any).association_chapters?.name ?? null,
        association_name: (data as any).associations?.name ?? null,
      })
    }
  }

  async function handleSetPassword() {
    setError('')
    if (password.length < 8)   { setError('Password must be at least 8 characters'); return }
    if (password !== confirm)   { setError('Passwords do not match'); return }

    const { error: updateError } = await sb.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); return }

    // Mark invitation as accepted
    if (inviteInfo?.email) {
      await sb
        .from('association_admin_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('email', inviteInfo.email)
        .eq('status', 'pending')
    }

    setStatus('success')
    setTimeout(() => router.replace('/association/dashboard'), 2000)
  }

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #0A0C10;
      color: #E8EBF0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #161A21;
      border: 1px solid #1F2430;
      border-radius: 16px;
      padding: 40px;
      width: 420px;
      max-width: 100%;
    }
    .logo {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.22em;
      color: #C8A96E;
      margin-bottom: 32px;
      text-transform: uppercase;
    }
    .title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    .sub   { font-size: 13px; color: #5A6070; margin-bottom: 24px; line-height: 1.6; }
    .info-box {
      background: #C8A96E18;
      border: 1px solid #C8A96E44;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 12px;
      color: #C8A96E;
      margin-bottom: 24px;
      line-height: 1.7;
    }
    .label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #5A6070;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .input {
      background: #111318;
      border: 1px solid #1F2430;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      color: #E8EBF0;
      font-family: inherit;
      width: 100%;
      margin-bottom: 16px;
      transition: border-color 0.15s;
    }
    .input:focus { outline: none; border-color: #C8A96E; }
    .btn {
      background: #C8A96E;
      color: #0A0C10;
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      font-family: inherit;
      transition: opacity 0.15s;
      margin-top: 4px;
    }
    .btn:hover   { opacity: 0.88; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .error-box {
      background: #EF444418;
      border: 1px solid #EF444444;
      border-radius: 7px;
      padding: 10px 14px;
      font-size: 12px;
      color: #EF4444;
      margin-bottom: 16px;
      line-height: 1.5;
    }
  `

  return (
    <>
      <style>{styles}</style>
      <div className="card">
        <div className="logo">MANOP Intelligence Platform</div>

        {status === 'loading' && (
          <p style={{ color: '#5A6070', fontSize: 14 }}>Verifying your invitation…</p>
        )}

        {status === 'set_password' && (
          <>
            <h1 className="title">Activate your account</h1>
            <p className="sub">
              You've been invited to manage{' '}
              {inviteInfo?.chapter_name
                ? <strong style={{ color: '#E8EBF0' }}>{inviteInfo.chapter_name}</strong>
                : 'your association'
              } on MANOP. Set a password to get started.
            </p>

            {inviteInfo && (
              <div className="info-box">
                <strong>{inviteInfo.association_name}</strong>
                {inviteInfo.chapter_name && <><br />{inviteInfo.chapter_name}</>}
                <br />
                <span style={{ opacity: 0.7 }}>{inviteInfo.email}</span>
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            <label className="label">New Password</label>
            <input
              className="input"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
            />

            <label className="label">Confirm Password</label>
            <input
              className="input"
              type="password"
              placeholder="Repeat password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
            />

            <button
              className="btn"
              onClick={handleSetPassword}
              disabled={!password || !confirm}
            >
              Activate Account
            </button>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h1 className="title">Account activated</h1>
            <p className="sub">Redirecting you to your dashboard…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="title" style={{ color: '#EF4444' }}>Invalid invitation</h1>
            <p className="sub">{error}</p>
            <p style={{ fontSize: 12, color: '#5A6070', lineHeight: 1.7 }}>
              Ask your national association admin to resend the invitation from their Team Access panel.
            </p>
          </>
        )}
      </div>
    </>
  )
}