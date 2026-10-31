// app/api/admin/articles/route.ts
// MANOP Research — admin list + create. Runs as the caller (sbFromRequest); RLS is_manop_admin() enforces.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/admin-guard'
import { parseArticleInput, publishBlockers, readingMinutes } from '../../../../lib/research'

const LIST_COLUMNS = 'id,slug,title,excerpt,category,status,published_at,updated_at,location_slug,hero_image_url,hero_image_alt,reading_minutes,author_name'

export async function GET(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const { data, error } = await g.sb.from('research_articles').select(LIST_COLUMNS).order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ articles: data })
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const parsed = parseArticleInput(body, { partial: false })
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join(' ') }, { status: 400 })
  const v = parsed.value
  const status = v.status ?? 'draft'
  if (status === 'published') {
    const blockers = publishBlockers(v)
    if (blockers.length) return NextResponse.json({ error: `To publish, add ${blockers.join(', ')}.` }, { status: 400 })
  }
  const { data, error } = await g.sb.from('research_articles').insert({
    ...v, status,
    reading_minutes: v.reading_minutes ?? readingMinutes(v.body ?? ''),
    author_user_id: g.user.id,
    published_at: status === 'published' ? new Date().toISOString() : null,
  }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That slug is already used by another article.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 400 })
  }
  return NextResponse.json({ article: data }, { status: 201 })
}