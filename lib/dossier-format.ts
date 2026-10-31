// lib/dossier-format.ts — small presentation helpers for the development dossier. No data access.

/** ₦338m, ₦1.5bn, ₦950k — the way prices are spoken in Lagos. Null for missing/invalid. */
export function ngnShort(n: unknown): string | null {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  const t = (x: number) => String(Math.round(x * 10) / 10).replace(/\.0$/, '')
  if (v >= 1e9) return `₦${t(v / 1e9)}bn`
  if (v >= 1e6) return `₦${t(v / 1e6)}m`
  if (v >= 1e3) return `₦${t(v / 1e3)}k`
  return `₦${v.toLocaleString()}`
}

/** Breaks one long review paragraph into readable paragraphs (at most `perPara` sentences / `maxChars` characters each). Text is unchanged. */
export function toParagraphs(text: string | null | undefined, perPara = 2, maxChars = 420): string[] {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return []
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
  const out: string[] = []
  let cur: string[] = []
  for (const s of sentences) {
    cur.push(s)
    if (cur.length >= perPara || cur.join(' ').length >= maxChars) { out.push(cur.join(' ')); cur = [] }
  }
  if (cur.length) out.push(cur.join(' '))
  return out
}
