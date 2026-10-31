'use client'
// app/admin/research/[id]/page.tsx — create ("new") or edit one MANOP Research article

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../../lib/theme'
import ManopLoader from '../../../../components/ManopLoader'
import ArticleEditor from '../../../../components/ArticleEditor'

export default function AdminArticleEditorPage() {
  const { user, checking } = useAuth('admin')
  const params = useParams<{ id: string }>()
  const [dark, setDark] = useState(true)
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])
  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />
  return (
    <div style={{ background: dark ? '#0F172A' : '#F8FAFC', minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <ArticleEditor articleId={params.id} dark={dark} />
      </div>
    </div>
  )
}