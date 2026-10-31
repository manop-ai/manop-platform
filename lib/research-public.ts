// lib/research-public.ts
//
// Public reads of MANOP Research for Server Components / sitemap. Uses sbServerRead
// (anonymous, RLS applies): only status='published' rows are ever visible, and the
// explicit filters below mirror the policy so intent is obvious.

import { sbServerRead } from './supabase/server-read'
import { unstable_noStore as noStore } from 'next/cache'
import type { ArticleListRow, ArticleRow } from './research'

const LIST = 'id,slug,title,excerpt,category,status,published_at,updated_at,location_slug,hero_image_url,hero_image_alt,reading_minutes,author_name'
const nowIso = () => new Date().toISOString()

export async function getPublishedArticles(opts: { limit?: number; locationSlugs?: string[]; excludeSlug?: string } = {}): Promise<{ rows: ArticleListRow[]; ok: boolean }> {
  noStore() // never serve a cached copy: unpublishing must take effect immediately
  let q = sbServerRead.from('research_articles').select(LIST).eq('status', 'published').lte('published_at', nowIso()).order('published_at', { ascending: false })
  if (opts.locationSlugs?.length) q = q.in('location_slug', opts.locationSlugs)
  if (opts.excludeSlug) q = q.neq('slug', opts.excludeSlug)
  const { data, error } = await q.limit(opts.limit ?? 50)
  return { rows: (data as ArticleListRow[]) ?? [], ok: !error }
}

export async function getArticleBySlug(slug: string): Promise<ArticleRow | null> {
  noStore() // never serve a cached copy: unpublishing must take effect immediately
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  const { data } = await sbServerRead.from('research_articles').select('*').eq('slug', slug).eq('status', 'published').lte('published_at', nowIso()).maybeSingle()
  return (data as ArticleRow) ?? null
}