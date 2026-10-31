// app/api/admin/articles/[id]/route.ts
// MANOP Research — admin read / update / delete one article. Runs as the caller; RLS enforces admin.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/admin-guard'
import { parseArticleInput, publishBlockers, readingMinutes, UUID_RE } from '../../../../../lib/research'

type Ctx = { params: { id: string } }
const bad = () => NextResponse.json({ error: 'Invalid article id.' }, { status: 400 })

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return bad()
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const { data, error } = await g.sb.from('research_articles').select('*').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
  return NextResponse.json({ article: data })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return bad()
  const g = await requireAdmin(req); if ('error' in g) return g.error
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const parsed = parseArticleInput(body, { partial: true })
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join(' ') }, { status: 400 })
  const v = parsed.value

  const { data: current, error: readErr } = await g.sb.from('research_articles').select('*').eq('id', params.id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 })
  if (!current) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })

  const merged = { ...current, ...v }
  const patch: Record<string, unknown> = { ...v, updated_at: new Date().toISOString() }
  if (v.body !== undefined && v.reading_minutes === undefined) patch.reading_minutes = readingMinutes(v.body)
  if (merged.status === 'published') {
    const blockers = publishBlockers(merged)
    if (blockers.length) return NextResponse.json({ error: `To publish, add ${blockers.join(', ')}.` }, { status: 400 })
    if (!current.published_at) patch.published_at = new Date().toISOString() // first publication date is kept on later unpublish/republish
  }

  const { data, error } = await g.sb.from('research_articles').update(patch).eq('id', params.id).select().maybeSingle()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That slug is already used by another article.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
  }
  if (!data) return NextResponse.json({ error: 'Not permitted, or the article no longer exists.' }, { status: 403 })
  return NextResponse.json({ article: data })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return bad()
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const { data: current } = await g.sb.from('research_articles').select('status').eq('id', params.id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
  if (current.status === 'published') return NextResponse.json({ error: 'Unpublish this article before deleting it.' }, { status: 409 })
  const { data, error } = await g.sb.from('research_articles').delete().eq('id', params.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
  if (!data?.length) return NextResponse.json({ error: 'Not permitted, or already deleted.' }, { status: 403 })
  return NextResponse.json({ ok: true })
}