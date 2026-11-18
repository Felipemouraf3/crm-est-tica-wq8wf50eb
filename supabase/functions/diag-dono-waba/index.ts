// De quem é a WABA nova? — 08/11/2026
// A tela do portfólio "psesteticaa" está vazia, mas a API vê a WABA.
// Então ela pertence a OUTRO portfólio (provavelmente criado no signup da coexistência).
// @ts-nocheck
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const G = 'https://graph.facebook.com/v21.0'
const WABA = '1158502057234375'
const PHONE = '1482747711582760'
const TOKEN_REF = 'vault:5baaf02c-dc24-4044-a22b-cdff5a1d2a50'

async function segredo(ref: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/_edge_read_secret`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret_ref: ref }),
  })
  if (!r.ok) return ''
  return String(await r.json()).trim()
}

async function g(path: string, token: string) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${G}${path}${sep}access_token=${encodeURIComponent(token)}`)
  let j: any
  try { j = await r.json() } catch { j = { raw: 'sem json' } }
  return { status: r.status, erro: j?.error?.message ?? null, body: j }
}

Deno.serve(async () => {
  const token = await segredo(TOKEN_REF)
  const out: Record<string, unknown> = {}

  // dono da WABA
  out.waba_dono = await g(`/${WABA}?fields=id,name,owner_business_info,account_review_status,is_enabled_for_insights`, token)
  // dono do numero
  out.numero_dono = await g(`/${PHONE}?fields=id,display_phone_number,verified_name,status,platform_type,is_on_biz_app,owner_business_info`, token)
  // clientes do WABA (quem tem acesso)
  out.waba_clientes = await g(`/${WABA}/assigned_users?fields=id,name`, token)
  out.waba_agencies = await g(`/${WABA}/agencies?fields=id,name`, token)

  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } })
})
