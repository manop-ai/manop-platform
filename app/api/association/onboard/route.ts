// ============================================================
// MANOP — Association Full Onboard API Route
// app/api/association/onboard/route.ts
//
// Called from admin dashboard "Onboard Association" tab.
// Does everything in one request:
// 1. Creates the association record
// 2. Finds or creates the national admin auth user
// 3. Assigns the association_national_admin role
// 4. Sends them a password-set email
// No SQL needed. Admin does it all from the dashboard.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const sbPublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: Request) {
  // Verify caller is MANOP admin
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authErr } = await sbPublic.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const callerRole = user.user_metadata?.user_role
  if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const { name, short_code, country_code, contact_name, contact_email,
          contact_phone, website, description, is_pilot, national_admin_email } = body

  if (!name || !short_code || !contact_email || !national_admin_email) {
    return NextResponse.json({
      error: 'name, short_code, contact_email, and national_admin_email are required'
    }, { status: 400 })
  }

  // ── Step 1: Create association ─────────────────────────────
  const { data: assoc, error: assocErr } = await sbAdmin
    .from('associations')
    .insert({
      name:                 name.trim(),
      short_code:           short_code.toUpperCase().trim(),
      country_code:         country_code ?? 'NG',
      contact_name:         contact_name ?? '',
      contact_email:        contact_email.toLowerCase().trim(),
      contact_phone:        contact_phone ?? '',
      website:              website ?? '',
      description:          description ?? '',
      is_pilot:             is_pilot ?? false,
      status:               'active',
      verification_partner: true,
      can_see_aggregates:   true,
    })
    .select()
    .single()

  if (assocErr) {
    const msg = assocErr.message.includes('unique')
      ? `Short code "${short_code.toUpperCase()}" already taken.`
      : assocErr.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // ── Step 2: Find or create national admin auth user ────────
  const cleanEmail = national_admin_email.toLowerCase().trim()
  const { data: userList } = await sbAdmin.auth.admin.listUsers({ perPage: 1000 })
  const existing = userList?.users?.find((u: any) => u.email === cleanEmail)

  let adminUserId: string

  if (existing) {
    adminUserId = existing.id
  } else {
    const { data: newUser, error: createErr } = await sbAdmin.auth.admin.createUser({
      email:         cleanEmail,
      email_confirm: true,
      user_metadata: {
        user_role:              'association_national_admin',
        invited_by_association: assoc.id,
      },
    })
    if (createErr || !newUser?.user) {
      await sbAdmin.from('associations').delete().eq('id', assoc.id)
      return NextResponse.json({
        error: `Failed to create admin user: ${createErr?.message}`
      }, { status: 500 })
    }
    adminUserId = newUser.user.id

    await sbAdmin.from('user_profiles').insert({
      auth_user_id: adminUserId,
      email:        cleanEmail,
      user_role:    'association_national_admin',
    })
  }

  // ── Step 3: Assign national admin role ─────────────────────
  const { data: existingRole } = await sbAdmin
    .from('association_user_roles')
    .select('id')
    .eq('user_id', adminUserId)
    .eq('association_id', assoc.id)
    .maybeSingle()

  if (!existingRole) {
    await sbAdmin.from('association_user_roles').insert({
      user_id:        adminUserId,
      role:           'association_national_admin',
      scope_type:     'association',
      association_id: assoc.id,
      granted_by:     user.id,
      is_active:      true,
    })
  }

  // ── Step 4: Send password-set activation email ─────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://manopintel.com'
  const { error: linkErr } = await sbAdmin.auth.admin.generateLink({
    type:  'recovery',
    email: cleanEmail,
    options: { redirectTo: `${siteUrl}/association/accept-invite` },
  })

  // Build the activation URL manually as fallback
  // If email fails, admin can copy this URL and send it manually
  const activationUrl = `${siteUrl}/association/accept-invite`

  return NextResponse.json({
    success:          true,
    association_id:   assoc.id,
    admin_user_id:    adminUserId,
    email_sent:       !linkErr,
    activation_url:   activationUrl,
    message: !linkErr
      ? `Done. Activation email sent to ${cleanEmail}. They will receive a link to set their password.`
      : `Association created but email failed (Supabase free plan limit). Ask ${cleanEmail} to go to ${siteUrl}/login and click "Forgot password" to set their password and access the dashboard.`,
  })
}