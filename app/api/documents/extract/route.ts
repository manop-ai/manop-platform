// app/api/documents/extract/route.ts
//
// AI-assisted extraction of structured fields from an uploaded survey
// plan / title document (blueprint §4: "Extract... Human confirmation.
// The extracted information should not automatically become truth.").
//
// This ONLY ever writes to `extracted_data` with
// extraction_status = 'extracted_pending_confirmation'. Nothing else
// in the schema reads extracted_data as fact — a human must explicitly
// confirm it (a separate, simple endpoint/UI action, not built here)
// before anything derived from it (e.g. area_sqm, coordinates) is
// written onto the `sites` row itself.
//
// SECURITY: admin only (the only caller is the admin site-review screen). It used to be open to anyone, which let an anonymous caller
// spend the Anthropic key and make the server fetch any URL (SSRF). The document is now looked up by id and its stored URL is used;
// the URL in the request body is ignored, only https Cloudinary hosts are fetched, and size/type are capped.
//
// Requires ANTHROPIC_API_KEY as a server-only env var (never exposed
// to the client — this route runs server-side only, standard for a
// Next.js Route Handler).

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/admin-guard'

const EXTRACTION_PROMPT = `You are reading a Nigerian land survey plan or title document. Extract ONLY what is explicitly written on the document. Do not infer, estimate, or guess anything not directly stated.

Return ONLY a JSON object (no markdown, no commentary) with these fields, using null for anything not found:
{
  "survey_number": string | null,
  "survey_date": string | null,
  "surveyor_name": string | null,
  "area_sqm": number | null,
  "area_as_stated": string | null,
  "coordinate_reference_system": string | null,
  "beacon_coordinates": [{"label": string, "x": number, "y": number}] | null,
  "location_description": string | null,
  "title_type": string | null,
  "registered_owner_name": string | null,
  "notes_for_human_reviewer": string | null
}`

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isCloudinaryHttps(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'res.cloudinary.com' } catch { return false }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null) as { document_id?: string } | null
  const document_id = body?.document_id
  if (!document_id || !UUID.test(document_id)) {
    return NextResponse.json({ error: 'document_id is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 })
  }

  const sb = guard.sb
  // The stored URL is the only one used. Read as the admin caller so RLS still applies.
  const { data: doc } = await sb.from('developer_documents').select('id,document_url').eq('id', document_id).maybeSingle()
  if (!doc?.document_url) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  if (!isCloudinaryHttps(doc.document_url)) {
    return NextResponse.json({ error: 'Only documents stored on MANOP’s Cloudinary account can be extracted.' }, { status: 400 })
  }

  try {
    const fileRes = await fetch(doc.document_url, { redirect: 'error' })
    if (!fileRes.ok) throw new Error(`Could not fetch document (${fileRes.status})`)
    const contentType = (fileRes.headers.get('content-type') || 'application/pdf').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.includes(contentType)) throw new Error('Unsupported file type for extraction.')
    const declared = Number(fileRes.headers.get('content-length') || 0)
    if (declared > MAX_BYTES) throw new Error('File is too large for extraction (10 MB limit).')
    const buffer = Buffer.from(await fileRes.arrayBuffer())
    if (buffer.length > MAX_BYTES) throw new Error('File is too large for extraction (10 MB limit).')
    const base64 = buffer.toString('base64')

    const isPdf = contentType.includes('pdf')
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: EXTRACTION_PROMPT }] }],
      }),
    })

    if (!claudeRes.ok) {
      console.error('extract: model request failed', claudeRes.status)
      throw new Error('Extraction request failed.')
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.find((b: any) => b.type === 'text')?.text || '{}'
    const cleaned = rawText.replace(/```json|```/g, '').trim()

    let extracted: Record<string, unknown>
    try {
      extracted = JSON.parse(cleaned)
    } catch {
      throw new Error('Model did not return valid JSON — extraction unreliable, not saved')
    }

    const { error: updateError } = await sb
      .from('developer_documents')
      .update({ extracted_data: extracted, extraction_status: 'extracted_pending_confirmation' })
      .eq('id', document_id)
    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({ extracted_data: extracted, status: 'extracted_pending_confirmation' })
  } catch (err: any) {
    await sb.from('developer_documents').update({ extraction_status: 'extraction_failed' }).eq('id', document_id)
    return NextResponse.json({ error: err?.message || 'Extraction failed' }, { status: 500 })
  }
}
