// P1-S02-T01 — admin-invite-user
// Convida um usuário (e-mail/senha) e cria as memberships permitidas.
// Escopo: owner/clinic_admin. service_role somente aqui (server-side).
// Ordem: autentica sessão → valida papel → valida payload → convida.
// Convite marca raw_user_meta_data.invited_at — o trigger do banco libera
// somente usuários convidados (auto-cadastro público bloqueado).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_ROLES = [
  'owner',
  'clinic_admin',
  'manager',
  'sales',
  'reception',
  'post_sales',
  'viewer',
]

function json(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // 1. Autenticação primeiro: sem sessão válida, nada mais é avaliado
  const callerToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!callerToken) return json(401, { error: 'unauthorized' })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) return json(500, { error: 'server_misconfigured' })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  const asCaller = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser()
  if (callerErr || !callerUser?.user) return json(401, { error: 'unauthorized' })
  const callerId = callerUser.user.id

  // 2. Papel do convidador: somente owner/clinic_admin
  const { data: callerMemberships, error: cmErr } = await admin
    .from('memberships')
    .select('organization_id, clinic_id, role, active')
    .eq('user_id', callerId)
    .eq('active', true)
  if (cmErr) return json(500, { error: 'internal_error' })

  const isOwner = callerMemberships.some((m: { role: string }) => m.role === 'owner')
  const isClinicAdmin = callerMemberships.some((m: { role: string }) => m.role === 'clinic_admin')
  if (!isOwner && !isClinicAdmin) return json(403, { error: 'forbidden' })

  // 3. Só agora valida o payload
  let body: {
    email?: string
    name?: string
    memberships?: Array<{ organization_id: string; clinic_id: string; role: string }>
  }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const email = (body.email || '').trim().toLowerCase()
  const name = (body.name || '').trim()
  const memberships = Array.isArray(body.memberships) ? body.memberships : []

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json(422, { error: 'invalid_email' })
  if (!name) return json(422, { error: 'invalid_name' })
  if (memberships.length === 0 || memberships.length > 20)
    return json(422, { error: 'invalid_memberships' })
  for (const m of memberships) {
    if (!m.organization_id || !m.clinic_id || !ALLOWED_ROLES.includes(m.role)) {
      return json(422, { error: 'invalid_membership_payload' })
    }
  }

  // 4. clinic_admin só convida na própria clínica e não concede papel owner
  const callerClinics = new Set(callerMemberships.map((m: { clinic_id: string }) => m.clinic_id))
  for (const m of memberships) {
    if (!isOwner && !callerClinics.has(m.clinic_id)) return json(403, { error: 'forbidden_clinic' })
    if (!isOwner && m.role === 'owner') return json(403, { error: 'forbidden_role' })
  }

  // 5. Convidar (trigger do banco libera somente com invited_at)
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, invited_at: new Date().toISOString() },
  })

  let userId: string
  if (inviteErr) {
    if (
      /already been registered|already registered|already exists/i.test(inviteErr.message || '')
    ) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const found = list?.users?.find((u: { email: string }) => u.email === email)
      if (!found) return json(404, { error: 'user_not_found' })
      userId = found.id
    } else {
      return json(502, { error: 'invite_failed' })
    }
  } else {
    userId = inviteData.user.id
  }

  // 6. Profile (contrato T01; trigger do banco já cria, upsert garante)
  const { error: profErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      name,
      status: 'active',
    },
    { onConflict: 'id' },
  )
  if (profErr) return json(500, { error: 'profile_failed' })

  // 7. Memberships — sem UNIQUE composta no banco (PK é id):
  // reutiliza vínculo existente (reativa) ou insere novo
  for (const m of memberships) {
    const { data: existing } = await admin
      .from('memberships')
      .select('id, active')
      .eq('user_id', userId)
      .eq('organization_id', m.organization_id)
      .eq('clinic_id', m.clinic_id)
      .eq('role', m.role)
      .limit(1)
    if (existing && existing.length > 0) {
      if (!existing[0].active) {
        await admin.from('memberships').update({ active: true }).eq('id', existing[0].id)
      }
    } else {
      const { error: memErr } = await admin.from('memberships').insert({
        user_id: userId,
        organization_id: m.organization_id,
        clinic_id: m.clinic_id,
        role: m.role,
        active: true,
      })
      if (memErr) return json(500, { error: 'membership_failed' })
    }
  }

  return json(200, { ok: true, user_id: userId, memberships_created: memberships.length })
})
