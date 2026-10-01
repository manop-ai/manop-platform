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
// Requires ANTHROPIC_API_KEY as a server-only env var (never exposed
// to the client — this route runs server-side only, standard for a
// Next.js Route Handler).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function POST(req: NextRequest) {
  const { document_id, document_url } = (await req.json()) as { document_id: string; document_url: string }

  if (!document_id || !document_url) {
    return NextResponse.json({ error: 'document_id and document_url are required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )

  try {
    // Fetch the document (Cloudinary URL) and base64-encode it
    const fileRes = await fetch(document_url)
    if (!fileRes.ok) throw new Error(`Could not fetch document (${fileRes.status})`)
    const contentType = fileRes.headers.get('content-type') || 'application/pdf'
    const buffer = Buffer.from(await fileRes.arrayBuffer())
    const base64 = buffer.toString('base64')

    const isPdf = contentType.includes('pdf')
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [contentBlock, { type: 'text', text: EXTRACTION_PROMPT }],
        }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      throw new Error(`Extraction request failed: ${errText}`)
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
      .update({
        extracted_data: extracted,
        extraction_status: 'extracted_pending_confirmation',
      })
      .eq('id', document_id)

    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({ extracted_data: extracted, status: 'extracted_pending_confirmation' })
  } catch (err: any) {
    await sb.from('developer_documents').update({ extraction_status: 'extraction_failed' }).eq('id', document_id)
    return NextResponse.json({ error: err?.message || 'Extraction failed' }, { status: 500 })
  }
}