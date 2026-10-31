// app/api/developments/[id]/buyer-pack/route.ts — download the MANOP Buyer Pack (PDF) for a published development.
// Generated on demand from the current record every time; never cached, so changed visibility, prices or updates are
// reflected immediately. Public: signed-out users get the pack without developer identity, as on the public page.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { buildBuyerPackPdf, packFilename } from '../../../../lib/buyer-pack'
import { loadPackData } from '../../../../lib/buyer-pack-server'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Development not found.' }, { status: 404 })
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  const data = await loadPackData(params.id, {
    signedIn: !!user,
    developerName: async (developerId: string) => (await sb.from('developer_accounts').select('company_name').eq('id', developerId).maybeSingle()).data?.company_name ?? null,
  })
  if (!data) return NextResponse.json({ error: 'This development is not available.' }, { status: 404 })
  let bytes: Uint8Array
  try { bytes = await buildBuyerPackPdf(data) } catch { return NextResponse.json({ error: 'The Buyer Pack could not be generated. Please try again.' }, { status: 500 }) }
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${packFilename(data.project.name, data.generatedAt)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}