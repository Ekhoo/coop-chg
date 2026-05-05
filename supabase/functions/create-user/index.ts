// Edge Function: création/désactivation d'un utilisateur par un admin.
// Déploiement: `supabase functions deploy create-user --no-verify-jwt`
// (on vérifie le JWT manuellement pour pouvoir consulter le rôle dans `profiles`).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401)
  }

  // Client lié au caller pour vérifier le profil
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Non authentifié' }, 401)

  const { data: profile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile || profile.role !== 'admin' || !profile.active) {
    return json({ error: 'Réservé aux admins' }, 403)
  }

  // Client privilégié pour créer l'utilisateur
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let body: {
    action?: 'create' | 'set_active' | 'set_role'
    email?: string
    password?: string
    display_name?: string
    role?: 'admin' | 'seller'
    user_id?: string
    active?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }

  const action = body.action ?? 'create'

  if (action === 'create') {
    const { email, password, display_name, role } = body
    if (!email || !password || !display_name || !role) {
      return json({ error: 'Champs manquants' }, 400)
    }
    if (role !== 'admin' && role !== 'seller') {
      return json({ error: 'Rôle invalide' }, 400)
    }
    if (password.length < 8) {
      return json({ error: 'Mot de passe trop court (8 caractères min)' }, 400)
    }

    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name },
      })

    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Échec création' }, 400)
    }

    const { error: insertErr } = await adminClient.from('profiles').insert({
      id: created.user.id,
      role,
      display_name,
      active: true,
    })

    if (insertErr) {
      // rollback
      await adminClient.auth.admin.deleteUser(created.user.id)
      return json({ error: insertErr.message }, 400)
    }

    return json({ ok: true, user_id: created.user.id })
  }

  if (action === 'set_active') {
    const { user_id, active } = body
    if (!user_id || typeof active !== 'boolean') {
      return json({ error: 'Champs manquants' }, 400)
    }
    if (user_id === userData.user.id && active === false) {
      return json({ error: 'Impossible de se désactiver soi-même' }, 400)
    }
    const { error: updErr } = await adminClient
      .from('profiles')
      .update({ active })
      .eq('id', user_id)
    if (updErr) return json({ error: updErr.message }, 400)
    return json({ ok: true })
  }

  if (action === 'set_role') {
    const { user_id, role } = body
    if (!user_id || (role !== 'admin' && role !== 'seller')) {
      return json({ error: 'Champs invalides' }, 400)
    }
    const { error: updErr } = await adminClient
      .from('profiles')
      .update({ role })
      .eq('id', user_id)
    if (updErr) return json({ error: updErr.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Action inconnue' }, 400)
})
