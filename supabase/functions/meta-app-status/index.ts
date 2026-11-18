// Status do app para Coexistência — 08/11/2026
// A doc exige: "You must already be a Solution Partner or Tech Provider"
// Exige também app version 2.24.17+ no celular.
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const APP_ID = '1063262590063176'
const TOKEN_REF = 'vault:5baaf02c-dc24-4044-a22b-cdff5a1d2a50'
const APP_SECRET_REF = 'vault:f29cf9b3-46d8-4cd7-8e04-a687350c6ee3'

async function segredo(ref: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret_ref: ref }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

async function get(path: string) {
  const r = await fetch(`${G}${path}`)
  let j: any
  try { j = await r.json() } catch { j = { raw: 'sem json' } }
  return { status: r.status, erro: j?.error?.message ?? null, body: j }
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const appSecret = await segredo(APP_SECRET_REF)
  const appToken = `${APP_ID}|${appSecret}`
  const out: Record<string, unknown> = {}

  // dados do app (inclui categoria e se é tech provider)
  out.app = await get(`/${APP_ID}?fields=id,name,category,app_type,link&access_token=${appToken}`)
  // produto whatsapp habilitado?
  out.roles = await get(`/${APP_ID}/roles?access_token=${appToken}`)
  // verificação de negócio do app
  out.verified = await get(`/${APP_ID}?fields=verification_status,is_verified&access_token=${appToken}`)

  // qual o usuário de sistema
  out.sys = await get(`/122103812151520086?fields=id,name&access_token=${token}`)

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
