'use client'
// components/AdminNav.tsx
// Floating dashboard switcher — appears on all dashboards
// Shows only the dashboards the current user has access to
// Excludes the current page from options

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Settings, Globe, Building2, Construction, BarChart3, LayoutGrid, X, LogOut } from 'lucide-react'
import { sb } from '../lib/supabase/client'

const ALL_OPTIONS = [
  { label: 'Admin Panel',           path: '/admin',                 icon: <Settings size={16} />, roles: ['admin', 'super_admin'] },
  { label: 'Association Dashboard', path: '/association/dashboard', icon: <Globe size={16} />, roles: ['association_national_admin', 'chapter_admin', 'country_admin', 'analyst'] },
  { label: 'Agency Dashboard',      path: '/agency/dashboard',      icon: <Building2 size={16} />, roles: ['agency'] },
  { label: 'Developer Dashboard',   path: '/developer/dashboard',   icon: <Construction size={16} />, roles: ['developer'] },
  { label: 'Investor Dashboard',    path: '/investor/dashboard',    icon: <BarChart3 size={16} />, roles: ['investor', 'diaspora'] },
]

export default function AdminNav() {
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen]       = useState(false)
  const [options, setOptions] = useState<typeof ALL_OPTIONS>([])
  const [email, setEmail]     = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await sb.auth.getSession()
      if (!session?.user) return

      setEmail(session.user.email ?? '')
      const metaRole = session.user.user_metadata?.user_role ?? 'buyer'

      const { data: assocRole } = await sb
        .from('association_user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()

      const userRoles = new Set([metaRole, assocRole?.role].filter(Boolean) as string[])

      const available = ALL_OPTIONS.filter(opt =>
        opt.roles.some(r => userRoles.has(r)) && opt.path !== pathname
      )

      setOptions(available)
    }
    init()
  }, [pathname])

  // Don't render if no options (single-role user on their only dashboard)
  if (options.length === 0) return null

  const css = `
    .anav{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:'DM Sans',sans-serif}
    .anav-btn{width:48px;height:48px;border-radius:50%;background:#5B2EFF;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 20px rgba(91,46,255,0.4);transition:all 0.2s;margin-left:auto;color:white}
    .anav-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(91,46,255,0.55)}
    .anav-menu{background:#1E293B;border:1px solid rgba(248,250,252,0.1);border-radius:14px;padding:8px;margin-bottom:10px;min-width:220px;box-shadow:0 12px 40px rgba(0,0,0,0.5)}
    .anav-head{padding:8px 10px 10px;font-size:10px;color:rgba(248,250,252,0.35);font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid rgba(248,250,252,0.06);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .anav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:rgba(248,250,252,0.75);border:none;background:none;width:100%;text-align:left;transition:all 0.15s;font-family:inherit}
    .anav-item:hover{background:rgba(91,46,255,0.15);color:#F8FAFC}
    .anav-div{height:1px;background:rgba(248,250,252,0.06);margin:6px 0}
    .anav-out{color:rgba(239,68,68,0.75)!important}
    .anav-out:hover{background:rgba(239,68,68,0.1)!important;color:#EF4444!important}
  `

  return (
    <>
      <style>{css}</style>
      <div className="anav">
        {open && (
          <div className="anav-menu">
            <div className="anav-head">{email}</div>
            {options.map(opt => (
              <button key={opt.path} className="anav-item"
                onClick={() => { router.push(opt.path); setOpen(false) }}>
                <span style={{width:24,display:'flex',justifyContent:'center'}}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
            <div className="anav-div"/>
            <button className="anav-item anav-out"
              onClick={() => sb.auth.signOut().then(() => router.replace('/login'))}>
              <span style={{width:24,display:'flex',justifyContent:'center'}}><LogOut size={16} /></span>
              Sign out
            </button>
          </div>
        )}
        <button className="anav-btn" onClick={() => setOpen(o => !o)} title="Switch dashboard">
          {open ? <X size={20} /> : <LayoutGrid size={20} />}
        </button>
      </div>
    </>
  )
}