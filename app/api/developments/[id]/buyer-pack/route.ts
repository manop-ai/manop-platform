// app/api/developments/[id]/buyer-pack/route.ts — download the MANOP Buyer Pack (PDF) for a published development.
// (This route used to live at app/developments/[id]/buyer-pack, so the button's /api/... request returned 404.)
// Generated on demand from the current record every time; never cached, so changed visibility, prices or updates are
// reflected immediately. Public: signed-out users get the pack without developer identity, as on the public page.
// Access follows the approved commercial terms: free and open until a terms version requires access. A signed-in buyer who is issued a
// pack gets a record, so it appears under "Buyer Packs" on their dashboard.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { buildBuyerPackPdf, packFilename } from '../../../../../lib/buyer-pack'
import { loadPackData } from '../../../../../lib/buyer-pack-server'
import { checkPackAccess, recordPackIssued, PACK_DENIED_MESSAGE } from '../../../../../lib/buyer-pack-access-server'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID.test(params.id)) return NextResponse.json({ error: 'Development not found.' }, { status: 404 })
    const sb = sbFromRequest(req)
    const { data: { user } } = await sb.auth.getUser()
    const { data: isAdmin } = user ? await sb.rpc('is_manop_admin') : { data: false }

    const data = await loadPackData(params.id, {
      signedIn: !!user,
      developerName: async (developerId: string) => (await sb.from('developer_accounts').select('company_name').eq('id', developerId).maybeSingle()).data?.company_name ?? null,
    })
    if (!data) return NextResponse.json({ error: 'This development is not available.' }, { status: 404 })

    const access = await checkPackAccess(user?.id ?? null, params.id, isAdmin === true)
    if (!access.allowed) {
      const signIn = !user && access.reason === 'access_required'
      return NextResponse.json({ error: signIn ? 'Sign in to request access to this Buyer Pack.' : (PACK_DENIED_MESSAGE[access.reason] ?? 'You do not have access to this Buyer Pack.'), reason: access.reason }, { status: signIn ? 401 : 403 })
    }

    let bytes: Uint8Array
    try { bytes = await buildBuyerPackPdf(data) } catch (e) { console.error('buyer pack build failed', e); return NextResponse.json({ error: 'The Buyer Pack could not be generated. Please try again.' }, { status: 500 }) }
    if (user && access.free) await recordPackIssued(user.id, params.id, access.versionId)

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${packFilename(data.project.name, data.generatedAt)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e: unknown) {
    console.error('GET buyer-pack', e)
    return NextResponse.json({ error: 'The Buyer Pack could not be generated. Please try again.' }, { status: 500 })
  }
}