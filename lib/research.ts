// lib/research.ts
//
// MANOP Research (articles): types, constants and validation shared by the
// admin API routes, the admin editor and the public pages. Pure functions.

import { resolveLocation, slugify } from './locations'

export const ARTICLE_STATUSES = ['draft', 'published', 'unpublished'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]
export const ARTICLE_CATEGORIES = ['MANOP Research', 'Methodology', 'Market Evidence', 'Development Intelligence'] as const
export const SOURCE_TYPES = ['official', 'professional', 'public', 'manop'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official: 'Official', professional: 'Professional', public: 'Public', manop: 'MANOP',
}

export interface ArticleSource { label: string; url?: string; type?: SourceType; date?: string }

export interface ArticleRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string
  hero_image_url: string | null
  hero_image_alt: string | null
  hero_image_credit: string | null
  category: string
  author_name: string
  reading_minutes: number | null
  location_slug: string | null
  sources: ArticleSource[]
  status: ArticleStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ArticleListRow = Pick<ArticleRow, 'id' | 'slug' | 'title' | 'excerpt' | 'category' | 'status' | 'published_at' | 'updated_at' | 'location_slug' | 'hero_image_url' | 'hero_image_alt' | 'reading_minutes' | 'author_name'>

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isHttps = (u: string) => /^https:\/\/[^\s]+$/i.test(u)
const isHttp = (u: string) => /^https?:\/\/[^\s]+$/i.test(u)

export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

export type ArticleInput = Partial<{
  title: string; slug: string; excerpt: string | null; body: string
  hero_image_url: string | null; hero_image_alt: string | null; hero_image_credit: string | null
  category: string; author_name: string; reading_minutes: number | null
  location_slug: string | null; sources: ArticleSource[]; status: ArticleStatus
}>

// (not a discriminated union: this project's tsconfig is not strict, so `ok` would not narrow it)
export interface ParseResult { ok: boolean; value: ArticleInput; errors: string[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined)

/** Validates a create/update payload. Unknown keys are dropped. partial=true for PATCH. */
export function parseArticleInput(raw: unknown, opts: { partial: boolean }): ParseResult {
  const errors: string[] = []
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const v: ArticleInput = {}

  if ('title' in r || !opts.partial) {
    const t = str(r.title)
    if (!t || t.length < 3 || t.length > 160) errors.push('Title must be 3 to 160 characters.')
    else v.title = t
  }
  if ('slug' in r || !opts.partial) {
    const s = str(r.slug) || (v.title ? slugify(v.title) : '')
    if (!SLUG_RE.test(s) || s.length < 3 || s.length > 90) errors.push('Slug must be 3 to 90 characters: lowercase letters, numbers and single hyphens.')
    else v.slug = s
  }
  if ('excerpt' in r) {
    const e = r.excerpt == null ? null : str(r.excerpt) ?? ''
    if (e && e.length > 320) errors.push('Excerpt must be 320 characters or fewer.')
    else v.excerpt = e || null
  }
  if ('body' in r) {
    if (typeof r.body !== 'string' || r.body.length > 200_000) errors.push('Body must be text under 200,000 characters.')
    else v.body = r.body
  } else if (!opts.partial) v.body = ''
  for (const k of ['hero_image_url'] as const) {
    if (k in r) {
      const u = r[k] == null ? null : str(r[k]) ?? ''
      if (u && !isHttps(u)) errors.push('Hero image must be an https URL.')
      else v[k] = u || null
    }
  }
  for (const k of ['hero_image_alt', 'hero_image_credit'] as const) {
    if (k in r) { const t = r[k] == null ? null : str(r[k]) ?? ''; if (t && t.length > 200) errors.push(`${k} is too long.`); else v[k] = t || null }
  }
  if ('category' in r) { const c = str(r.category); if (!c || c.length > 60) errors.push('Category is required (max 60 characters).'); else v.category = c }
  if ('author_name' in r) { const a = str(r.author_name); if (!a || a.length > 80) errors.push('Author is required (max 80 characters).'); else v.author_name = a }
  if ('reading_minutes' in r) {
    if (r.reading_minutes == null || r.reading_minutes === '') v.reading_minutes = null
    else { const n = Number(r.reading_minutes); if (!Number.isInteger(n) || n < 1 || n > 90) errors.push('Reading time must be 1 to 90 minutes.'); else v.reading_minutes = n }
  }
  if ('location_slug' in r) {
    const l = r.location_slug == null ? null : str(r.location_slug) || null
    if (l && !resolveLocation(l)) errors.push('Location is not in the MANOP location list.')
    else v.location_slug = l
  }
  if ('sources' in r) {
    if (!Array.isArray(r.sources) || r.sources.length > 20) errors.push('Sources must be a list of up to 20.')
    else {
      const out: ArticleSource[] = []
      for (const s of r.sources as unknown[]) {
        const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
        const label = str(o.label)
        if (!label) { errors.push('Every source needs a label.'); continue }
        const url = str(o.url)
        if (url && !isHttp(url)) { errors.push(`Source "${label}" has an invalid link.`); continue }
        const type = str(o.type)
        if (type && !(SOURCE_TYPES as readonly string[]).includes(type)) { errors.push(`Source "${label}" has an invalid type.`); continue }
        out.push({ label: label.slice(0, 200), ...(url ? { url } : {}), ...(type ? { type: type as SourceType } : {}), ...(str(o.date) ? { date: str(o.date)!.slice(0, 40) } : {}) })
      }
      v.sources = out
    }
  }
  if ('status' in r) {
    const st = str(r.status)
    if (!st || !(ARTICLE_STATUSES as readonly string[]).includes(st)) errors.push('Status must be draft, published or unpublished.')
    else v.status = st as ArticleStatus
  }
  return { ok: errors.length === 0, value: v, errors }
}

/** What must be true before an article can be public. */
export function publishBlockers(a: { title?: string | null; slug?: string | null; excerpt?: string | null; body?: string | null }): string[] {
  const b: string[] = []
  if (!a.title?.trim()) b.push('a title')
  if (!a.slug?.trim()) b.push('a slug')
  if (!a.excerpt?.trim()) b.push('an excerpt')
  if ((a.body ?? '').trim().length < 200) b.push('article body (at least 200 characters)')
  return b
}