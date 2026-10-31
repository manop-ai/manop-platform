// lib/markdown.tsx
//
// A small, dependency-free Markdown renderer for MANOP Research. It renders
// to React elements (never to an HTML string), so article text can never
// inject markup or scripts. Supported: ## ### #### headings, paragraphs,
// **bold**, *italic*, [links](https://…), - and 1. lists, > quotes, ---,
// and ![alt](https://…) images. Anything else is shown as plain text.
//
// The admin editor writes this same Markdown through toolbar buttons, so the
// author never has to type syntax by hand.

import React from 'react'

export interface ArticleColors {
  textPrimary: string; textMuted: string; textFaint: string; border: string
  accent: string; surface: string
}

/** Only these URL shapes are ever rendered as links / images. */
export function safeUrl(u: string, opts: { image?: boolean } = {}): string | null {
  const s = u.trim()
  if (opts.image) return /^https:\/\/[^\s]+$/i.test(s) ? s : null
  if (/^https?:\/\/[^\s]+$/i.test(s) || /^mailto:[^\s]+$/i.test(s)) return s
  if (/^\/(?!\/)[^\s]*$/.test(s) || /^#[\w-]+$/.test(s)) return s
  return null
}

const INLINE = /(!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*)/g

function inline(text: string, c: ArticleColors, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0, i = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const k = `${keyBase}-${i++}`
    if (m[2] !== undefined) {
      const src = safeUrl(m[3], { image: true })
      out.push(src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={k} src={src} alt={m[2]} loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />
        : m[0])
    } else if (m[4] !== undefined) {
      const href = safeUrl(m[5])
      out.push(href
        ? <a key={k} href={href} style={{ color: c.accent, textDecorationThickness: 1, textUnderlineOffset: 3 }}
            {...(/^https?:/i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{m[4]}</a>
        : m[4])
    } else if (m[6] !== undefined) out.push(<strong key={k} style={{ fontWeight: 700, color: c.textPrimary }}>{m[6]}</strong>)
    else if (m[7] !== undefined) out.push(<em key={k}>{m[7]}</em>)
    last = idx + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export interface Heading { level: 2 | 3 | 4; text: string; id: string }

const hid = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export function renderMarkdown(src: string, c: ArticleColors): { nodes: React.ReactNode[]; headings: Heading[] } {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const nodes: React.ReactNode[] = []
  const headings: Heading[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let quote: string[] = []
  let n = 0
  const key = () => `b${n++}`

  const flushPara = () => {
    if (!para.length) return
    const k = key()
    nodes.push(<p key={k} style={{ margin: '0 0 1.4em' }}>{inline(para.join(' '), c, k)}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const k = key()
    const items = list.items.map((it, j) => <li key={`${k}-${j}`} style={{ margin: '0 0 0.5em' }}>{inline(it, c, `${k}-${j}`)}</li>)
    nodes.push(list.ordered
      ? <ol key={k} style={{ margin: '0 0 1.4em', paddingLeft: '1.4em' }}>{items}</ol>
      : <ul key={k} style={{ margin: '0 0 1.4em', paddingLeft: '1.2em' }}>{items}</ul>)
    list = null
  }
  const flushQuote = () => {
    if (!quote.length) return
    const k = key()
    nodes.push(
      <blockquote key={k} style={{ margin: '0 0 1.6em', padding: '0.2em 0 0.2em 1.2em', borderLeft: `2px solid ${c.accent}`, color: c.textPrimary, fontSize: '1.08em', lineHeight: 1.65 }}>
        {inline(quote.join(' '), c, k)}
      </blockquote>)
    quote = []
  }
  const flushAll = () => { flushPara(); flushList(); flushQuote() }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushAll(); continue }
    const h = /^(#{1,4})\s+(.+)$/.exec(line)
    if (h) {
      flushAll()
      const level = (Math.min(Math.max(h[1].length, 2), 4)) as 2 | 3 | 4 // page title is the only h1
      const text = h[2].trim(); const id = hid(text); headings.push({ level, text, id })
      const k = key()
      const style: React.CSSProperties = level === 2
        ? { fontSize: '1.55em', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '2em 0 0.7em', color: c.textPrimary }
        : { fontSize: '1.2em', fontWeight: 700, lineHeight: 1.35, margin: '1.7em 0 0.55em', color: c.textPrimary }
      nodes.push(React.createElement(`h${level}`, { key: k, id, style }, inline(text, c, k)))
      continue
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); nodes.push(<hr key={key()} style={{ border: 0, borderTop: `1px solid ${c.border}`, margin: '2.2em 0' }} />); continue }
    const q = /^>\s?(.*)$/.exec(line)
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue }
    const ul = /^\s*[-*]\s+(.+)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (ul || ol) {
      flushPara(); flushQuote()
      const ordered = !!ol
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push((ul ?? ol)![1]); continue
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim())
    if (img) {
      const src2 = safeUrl(img[2], { image: true })
      flushAll()
      if (src2) {
        const k = key()
        nodes.push(
          <figure key={k} style={{ margin: '2em 0' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src2} alt={img[1]} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block' }} />
            {img[1] && <figcaption style={{ fontSize: '0.8em', color: c.textFaint, marginTop: 8 }}>{img[1]}</figcaption>}
          </figure>)
      }
      continue
    }
    flushList(); flushQuote()
    para.push(line.trim())
  }
  flushAll()
  return { nodes, headings }
}

export function ArticleBody({ source, colors }: { source: string; colors: ArticleColors }) {
  return <>{renderMarkdown(source, colors).nodes}</>
}