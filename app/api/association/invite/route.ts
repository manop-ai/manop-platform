// ============================================================
// MANOP — Association Invite API Route
// app/api/association/invite/route.ts
//
// Uses @supabase/supabase-js directly — matches your codebase pattern.
// No auth-helpers. Admin client for user creation, anon client for auth check.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Public client — for verifying the calling user's session
const sbPublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

// Admin client — for creating auth users (service role, server only)
const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: Request) {
  // Pull the session token from the Authorization header
  // (set by the client when calling this route)
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the token with Supabase
  const { data: { user }, error: authError } = await sbPublic.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { association_id, chapter_id, email, role } = body

  if (!association_id || !email || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify caller is national admin for this association
  const { data: callerRole } = await sbAdmin
    .from('association_user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('association_id', association_id)
    .in('role', ['association_national_admin', 'super_admin', 'country_admin'])
    .eq('is_active', true)
    .maybeSingle()

  if (!callerRole) {
    return NextResponse.json(
      { error: 'Only the association national admin can invite team members' },
      { status: 403 }
    )
  }

  const cleanEmail = email.toLowerCase().trim()

  // Check if auth user already exists
  const { data: existingList } = await sbAdmin.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = existingList?.users?.find((u: { email?: string }) => u.email === cleanEmail)

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    // Create new auth user — they'll receive a password reset email to set their password
    const { data: newUser, error: createError } = await sbAdmin.auth.admin.createUser({
      email: cleanEmail,
      email_confirm: true,
      user_metadata: {
        user_role: role,
        invited_by_association: association_id,
      },
    })

    if (createError || !newUser?.user) {
      return NextResponse.json(
        { error: createError?.message ?? 'Failed to create user' },
        { status: 500 }
      )
    }

    userId = newUser.user.id

    // Create user_profile row
    await sbAdmin.from('user_profiles').insert({
      auth_user_id: userId,
      email: cleanEmail,
      user_role: role,
    })
  }

  // Assign the association role (skip if already exists)
  const { data: existingRoleRow } = await sbAdmin
    .from('association_user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('association_id', association_id)
    .maybeSingle()

  if (!existingRoleRow) {
    await sbAdmin.from('association_user_roles').insert({
      user_id: userId,
      role,
      scope_type: chapter_id ? 'chapter' : 'association',
      association_id,
      chapter_id: chapter_id || null,
      granted_by: user.id,
      is_active: true,
    })
  }

  // Create invitation record
  const { data: invitation, error: inviteError } = await sbAdmin
    .from('association_admin_invitations')
    .insert({
      association_id,
      chapter_id: chapter_id || null,
      invited_by: user.id,
      email: cleanEmail,
      role,
      status: 'pending',
    })
    .select('*, association_chapters(name)')
    .single()

  if (inviteError || !invitation) {
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invitation' }, { status: 500 })
  }

  // Send password-set link so they can activate their account
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://manopintel.com'
  const { error: linkError } = await sbAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: cleanEmail,
    options: {
      redirectTo: `${siteUrl}/association/accept-invite?token=${invitation.invite_token}`,
    },
  })

  if (linkError) {
    // Non-fatal — log but don't fail. Invitation exists, email just didn't send.
    console.error('Invite email error:', linkError.message)
  }

  return NextResponse.json({
    success: true,
    invitation: {
      ...invitation,
      chapter_name: (invitation as any).association_chapters?.name ?? null,
    },
    message: `Invitation sent to ${cleanEmail}`,
  })
}

export async function DELETE(req: Request) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await sbPublic.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invitation_id, user_id_to_deactivate } = await req.json()

  await sbAdmin
    .from('association_admin_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitation_id)

  if (user_id_to_deactivate) {
    await sbAdmin
      .from('association_user_roles')
      .update({ is_active: false })
      .eq('user_id', user_id_to_deactivate)
  }

  return NextResponse.json({ success: true })
}